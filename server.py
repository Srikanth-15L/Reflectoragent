import os
import json
import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# Import the compiled graph from reflector.py
from reflector import graph
from langchain_core.messages import AIMessage, HumanMessage

app = FastAPI(title="Reflector Agent API", description="API to run and monitor the Reflector LangGraph agent")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HISTORY_FILE = Path("outputs") / "history.json"

class GenerateRequest(BaseModel):
    topic: str
    target_rating: Optional[int] = 8
    max_iterations: Optional[int] = 3

def serialize_message(msg):
    msg_type = "unknown"
    if isinstance(msg, AIMessage):
        msg_type = "ai"
    elif isinstance(msg, HumanMessage):
        msg_type = "human"
    else:
        msg_type = getattr(msg, "type", "unknown")
        
    return {
        "type": msg_type,
        "content": msg.content,
        "id": getattr(msg, "id", None)
    }

def get_history():
    if not HISTORY_FILE.exists():
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading history: {e}")
        return []

def save_to_history(entry):
    HISTORY_FILE.parent.mkdir(exist_ok=True)
    history = get_history()
    # Add new entry at the beginning
    history.insert(0, entry)
    # Keep only the last 50 runs to manage file size
    history = history[:50]
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving history: {e}")

@app.get("/api/history")
async def fetch_history():
    return get_history()

@app.post("/api/generate")
async def generate_article(request: GenerateRequest):
    topic = request.topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Topic cannot be empty")
        
    initial_state = {
        "topic": topic,
        "messages": [],
        "rating": 0,
        "iteration": 0,
        "target_rating": request.target_rating,
        "max_iterations": request.max_iterations
    }

    async def event_generator():
        run_id = str(uuid.uuid4())
        events_log = []
        final_article = ""
        final_rating = 0
        final_iterations = 0
        
        # Start event
        start_event = {
            "event": "start",
            "run_id": run_id,
            "topic": topic,
            "timestamp": datetime.utcnow().isoformat(),
            "target_rating": request.target_rating,
            "max_iterations": request.max_iterations
        }
        yield f"data: {json.dumps(start_event)}\n\n"
        await asyncio.sleep(0.01)

        try:
            # Stream the events from LangGraph
            async for event in graph.astream_events(initial_state, version="v2"):
                event_type = event.get("event")
                name = event.get("name")
                
                # 1. Node Start
                if event_type == "on_node_start" and name in ["search", "writer", "critic", "save"]:
                    formatted_event = {
                        "event": "node_start",
                        "node": name,
                    }
                    yield f"data: {json.dumps(formatted_event)}\n\n"
                    await asyncio.sleep(0.01)
                    
                # 2. Token Streaming (from Writer Chat Model)
                elif event_type == "on_chat_model_stream":
                    metadata = event.get("metadata", {})
                    # Ensure this stream comes from the writer node
                    if metadata.get("langgraph_node") == "writer":
                        chunk = event["data"].get("chunk")
                        if chunk and hasattr(chunk, "content"):
                            token = chunk.content
                            if token:
                                yield f"data: {json.dumps({'event': 'token', 'text': token})}\n\n"
                                
                # 3. Node End
                elif event_type == "on_node_end" and name in ["search", "writer", "critic", "save"]:
                    output = event["data"].get("output", {})
                    if isinstance(output, dict):
                        rating = output.get("rating", 0)
                        iteration = output.get("iteration", 0)
                        
                        if rating:
                            final_rating = rating
                        if iteration:
                            final_iterations = iteration
                            
                        messages = [serialize_message(m) for m in output.get("messages", [])]
                        
                        # Extract the final article draft if available
                        for msg in reversed(output.get("messages", [])):
                            if isinstance(msg, AIMessage):
                                final_article = msg.content
                                break
                                
                        formatted_event = {
                            "event": "node", # Key is 'node' to match previous history structure
                            "node": name,
                            "rating": rating,
                            "iteration": iteration,
                            "messages": messages,
                        }
                        
                        events_log.append(formatted_event)
                        yield f"data: {json.dumps(formatted_event)}\n\n"
                        # Short sleep to let UI process the node completion
                        await asyncio.sleep(0.2)
            
            # If the final article wasn't captured in the stream (e.g. from writer node),
            # let's look for it in the output file, or construct it.
            # The save_node writes outputs/article.md. We can read that file if available.
            output_file = Path("outputs") / "article.md"
            if output_file.exists() and not final_article:
                try:
                    # Parse article from output file
                    content = output_file.read_text(encoding="utf-8")
                    # article.md format:
                    # #topic
                    # _rating X/10-Y iterations_
                    # {article_content}
                    lines = content.split("\n\n")
                    if len(lines) >= 3:
                        final_article = "\n\n".join(lines[2:])
                except Exception as e:
                    print(f"Error reading final article from file: {e}")

            # If still not found, search the final messages sequence in a separate state call if needed
            
            # Complete event
            complete_event = {
                "event": "complete",
                "run_id": run_id,
                "rating": final_rating,
                "iterations": final_iterations,
                "article": final_article,
                "timestamp": datetime.utcnow().isoformat()
            }
            yield f"data: {json.dumps(complete_event)}\n\n"
            
            # Save this run to history
            history_entry = {
                "id": run_id,
                "topic": topic,
                "timestamp": datetime.utcnow().isoformat(),
                "rating": final_rating,
                "iterations": final_iterations,
                "article": final_article,
                "events": events_log
            }
            save_to_history(history_entry)

        except Exception as e:
            # Yield error event
            error_event = {
                "event": "error",
                "message": str(e)
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            print(f"Error in execution loop: {e}")

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Mount the static folder at root
# Note: Mount static files AFTER API endpoints so they don't override the routing.
# Create static folder if it doesn't exist
Path("static").mkdir(exist_ok=True)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Check if Tavily and OpenAI keys are present
    if not os.environ.get("OPENAI_API_KEY"):
        print("WARNING: OPENAI_API_KEY is not set in environment!")
    if not os.environ.get("TAVILY_API_KEY"):
        print("WARNING: TAVILY_API_KEY is not set in environment!")
        
    print("Starting server on http://localhost:8000")
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
