from pathlib import Path
from typing import Annotated,Literal,TypedDict
#Annoated-metadate to any variable
#Literal-good or bad or 1 or 0
#typed dict -- state we are creating eventually dictionary
from dotenv import load_dotenv
load_dotenv()

from langchain_core.messages import AIMessage,HumanMessage,BaseMessage
from langgraph.graph import START,END,StateGraph

from langgraph.graph.message import add_messages
from tavily import TavilyClient

from chains import writer_chain ,critic_chain

#step1 define state
class State(TypedDict,total=False):
    topic:str
    rating:int
    iteration:int
    target_rating:int
    max_iterations:int
    messages:Annotated[list[BaseMessage],add_messages]


#Loop terminates when either condition is met
TARGET_RATING=8
MAX_ITERATIONS=3

#step2-create the nodes
def search_node(state:State) -> State:
    """ one-time Tavily search.Research goes into seed the HumanMessage"""

    #1.run the websearch-tavily return a dict:we wnat results list
    hits=TavilyClient().search(state["topic"],max_results=5)["results"]

    #format each hit as one bullent line: "-title:first 200chars o content"
    research_lines=[]
    for hit in hits:
        title=hit["title"]
        snippet=hit["content"]
        research_lines.append(f"-{title}:{snippet}")
    research="\n".join(research_lines)

    #Build the seed message that kicks of the conversation
    seed = HumanMessage(content=(
        f"write a markdown article on: {state['topic']}\n\n"
        f"Use the research:\n{research}"
    ))
    #prompt goes to generate

    return {
        "messages": [seed],
        "rating": 0,
        "iteration": 0
    }


def writer_node(state:State) -> State:
    """ generate or revise the article from the current conversation"""
    #1.run the writer chain on running conversations
    #on iteration1 - it sees and writes a fresh article
    #on ite2-it sees[seed,draft,critique,..] and reqrites addressing the critique
    draft=writer_chain.invoke({"messages":state["messages"]})
    return {
        "messages":[draft],
        "iteration":state["iteration"]+1

    }


#read output state from genrator and extrat text run critique chain and update state with rating and iteration

def critique_node(state:State) -> State:
    """ critique the latest draft.score gates the loop:critque trains on next draft"""
    result=critic_chain.invoke({"messages":state["messages"]})
    feedback=HumanMessage(content=(
        f"Editor score:{result.rating}/10\n"
        f"feedback:{result.critique}\n\n"
        f"Rewrite the article addressing every point above"

    ))
    return {
        "messages":[feedback],
        "rating":result.rating,
    }

def should_continue(state:State) -> Literal["writer","save"]:
    """conditional edge --decide whether to loop again or finish
    Routers return a String that names next node
    langgraph reads this and routes the graph accordingly"""
    target = state.get("target_rating", TARGET_RATING)
    max_iter = state.get("max_iterations", MAX_ITERATIONS)
    if state["rating"] >= target:
        return "save"
    if state["iteration"] >= max_iter:
        return "save"
    return "writer"


def save_node(state:State) -> State:
    """ side-effect node --write the latest article to output output/article.md"""
    #1.find the most recent ai message in the conversation
    #find the latest article draft
    article=""
    for msg in reversed(state["messages"]):
        if isinstance(msg,AIMessage):
            article=msg.content
            break
            
    #2make sure outputs/exists and build file path
    Path("outputs").mkdir(exist_ok=True)
    path=Path("outputs")/"article.md"
    path.write_text(f"#{state['topic']}\n\n"
                    f" _rating {state['rating']}/10-{state['iteration']} iterations_\n\n"
                    f"{article}\n")
    print(f"saved -> {path}")
    return {}
    
graph_builder=StateGraph(State)
graph_builder.add_node("search",search_node)
graph_builder.add_node("writer",writer_node)
graph_builder.add_node("critic",critique_node)
graph_builder.add_node("save",save_node)

graph_builder.add_edge(START,"search")
graph_builder.add_edge("search","writer")
graph_builder.add_edge("writer","critic")
graph_builder.add_conditional_edges("critic",should_continue,
                                    {"writer":"writer","save":"save"})

graph_builder.add_edge("save",END)

graph=graph_builder.compile()

if __name__=='__main__':
    try:
        print(graph.get_graph().draw_mermaid())
        graph.get_graph().draw_mermaid_png(output_file_path="graph.png")
    except Exception as e:
        print(f"Could not draw mermaid graph: {e}")

    intial:State = {
        "topic":"why python is best language for AI",
        "messages":[],
        "rating":0,
        "iteration":0,
    }
    final=graph.invoke(intial)
    print(f"final_messages{final['messages'][-1].content}")
    print(f"\n final rating:{final['rating']}/10")
    print(f"Iterations':{final['iteration']}")

