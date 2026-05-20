// Reflector Agent UI Controller

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('generate-form');
    const topicInput = document.getElementById('topic');
    const targetRatingInput = document.getElementById('target-rating');
    const targetRatingVal = document.getElementById('target-rating-val');
    const maxIterationsInput = document.getElementById('max-iterations');
    const maxIterationsVal = document.getElementById('max-iterations-val');
    const submitBtn = document.getElementById('submit-btn');
    
    const systemStatusIndicator = document.getElementById('system-status-indicator');
    const systemStatusText = document.getElementById('system-status-text');
    
    const historyList = document.getElementById('history-list');
    const timelineLog = document.getElementById('timeline-log');
    
    const metricRating = document.getElementById('metric-rating');
    const metricIteration = document.getElementById('metric-iteration');
    const metricWords = document.getElementById('metric-words');
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    const renderedOutput = document.getElementById('rendered-output');
    const rawOutput = document.getElementById('raw-output');
    const critiqueTimeline = document.getElementById('critique-timeline');
    
    const actionsFooter = document.getElementById('actions-footer');
    const btnCopy = document.getElementById('btn-copy');
    const btnDownload = document.getElementById('btn-download');

    // Graph Nodes & Arrows
    const nodes = {
        start: document.getElementById('node-start'),
        search: document.getElementById('node-search'),
        writer: document.getElementById('node-writer'),
        critic: document.getElementById('node-critic'),
        save: document.getElementById('node-save')
    };

    const arrows = {
        startSearch: document.getElementById('arrow-start-search'),
        searchWriter: document.getElementById('arrow-search-writer'),
        writerCritic: document.getElementById('arrow-writer-critic'),
        criticWriter: document.getElementById('arrow-critic-writer'), // Loop arrow
        criticSave: document.getElementById('arrow-critic-save')
    };

    // State Variables
    let isRunning = false;
    let currentCritiques = [];
    let activeRunId = null;

    // Initialize Lucide Icons
    lucide.createIcons();

    // Slider Event Listeners
    targetRatingInput.addEventListener('input', (e) => {
        targetRatingVal.textContent = `${e.target.value}/10`;
    });

    maxIterationsInput.addEventListener('input', (e) => {
        maxIterationsVal.textContent = e.target.value;
    });

    // Tab Switching
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // Toggle buttons
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Toggle content
            tabContents.forEach(content => {
                if (content.id === `tab-${tabId}`) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });

    // Helper: Reset Graph Visuals
    function resetGraph() {
        Object.values(nodes).forEach(n => {
            n.className = 'graph-node disabled';
        });
        Object.values(arrows).forEach(a => {
            if (a) {
                a.classList.remove('active', 'completed');
                if (a.id === 'arrow-critic-writer') {
                    a.style.display = 'none';
                }
            }
        });
    }

    // Helper: Update Active Node & Arrow Path
    function updateGraphState(nodeName, iteration, rating, targetRating) {
        // Remove 'active' status from all nodes
        Object.values(nodes).forEach(n => n.classList.remove('active'));
        
        // Hide loop arrow by default unless active
        if (arrows.criticWriter) {
            arrows.criticWriter.classList.remove('active');
        }

        if (nodeName === 'search') {
            // Start -> Search path
            nodes.start.className = 'graph-node completed';
            nodes.search.className = 'graph-node active';
            arrows.startSearch.classList.add('active');
        }
        else if (nodeName === 'writer') {
            nodes.start.className = 'graph-node completed';
            nodes.search.className = 'graph-node completed';
            nodes.writer.className = 'graph-node active';
            
            arrows.startSearch.classList.add('completed');
            
            if (iteration > 1) {
                // We looped back from critique
                if (arrows.criticWriter) {
                    arrows.criticWriter.style.display = 'block';
                    arrows.criticWriter.classList.add('completed');
                }
                arrows.writerCritic.classList.remove('active', 'completed');
                nodes.critic.className = 'graph-node';
            } else {
                arrows.searchWriter.classList.add('active');
            }
        }
        else if (nodeName === 'critic') {
            nodes.start.className = 'graph-node completed';
            nodes.search.className = 'graph-node completed';
            nodes.writer.className = 'graph-node completed';
            nodes.critic.className = 'graph-node active';
            
            arrows.startSearch.classList.add('completed');
            arrows.searchWriter.classList.add('completed');
            arrows.writerCritic.classList.add('active');
            
            if (arrows.criticWriter) {
                arrows.criticWriter.classList.remove('active', 'completed');
            }
        }
        else if (nodeName === 'save') {
            nodes.start.className = 'graph-node completed';
            nodes.search.className = 'graph-node completed';
            nodes.writer.className = 'graph-node completed';
            nodes.critic.className = 'graph-node completed';
            nodes.save.className = 'graph-node active';
            
            arrows.startSearch.classList.add('completed');
            arrows.searchWriter.classList.add('completed');
            arrows.writerCritic.classList.add('completed');
            arrows.criticSave.classList.add('active');
            
            if (arrows.criticWriter) {
                arrows.criticWriter.classList.remove('active', 'completed');
            }
        }
    }

    // Helper: Complete Graph state
    function completeGraph() {
        Object.values(nodes).forEach(n => {
            if (!n.classList.contains('disabled')) {
                n.className = 'graph-node completed';
            }
        });
        Object.values(arrows).forEach(a => {
            if (a && a.classList.contains('active')) {
                a.classList.replace('active', 'completed');
            }
        });
    }

    // Helper: Add Timeline Log Entry
    function addLogEntry(nodeType, title, content) {
        const timeString = new Date().toLocaleTimeString();
        
        // Remove empty state if present
        const emptyState = timelineLog.querySelector('.empty-state');
        if (emptyState) {
            timelineLog.innerHTML = '';
        }
        
        const logItem = document.createElement('div');
        logItem.className = `log-item ${nodeType}`;
        
        let bodyHtml = '';
        if (typeof content === 'string') {
            bodyHtml = `<p>${content.replace(/\n/g, '<br>')}</p>`;
        } else if (Array.isArray(content)) {
            bodyHtml = '<ul>' + content.map(item => `<li>${item}</li>`).join('') + '</ul>';
        }
        
        logItem.innerHTML = `
            <div class="log-dot"></div>
            <div class="log-header">
                <span class="log-title">${title}</span>
                <span class="log-time">${timeString}</span>
            </div>
            <div class="log-body">
                ${bodyHtml}
            </div>
        `;
        
        timelineLog.appendChild(logItem);
        timelineLog.scrollTop = timelineLog.scrollHeight;
    }

    // Helper: Update Article metrics
    function updateMetrics(rating, iteration, articleText) {
        metricRating.textContent = rating ? `${rating}/10` : '-/10';
        metricIteration.textContent = iteration;
        
        const wordCount = articleText ? articleText.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
        metricWords.textContent = wordCount;
    }

    // Helper: Render markdown
    function renderMarkdown(mdText) {
        if (!mdText) {
            renderedOutput.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="edit-3"></i>
                    <p>Article draft will appear here</p>
                </div>
            `;
            lucide.createIcons();
            rawOutput.textContent = 'Draft markdown will render here...';
            return;
        }
        
        renderedOutput.innerHTML = marked.parse(mdText);
        rawOutput.textContent = mdText;
    }

    // Helper: Append Critique Card
    function addCritiqueCard(iteration, rating, critiqueText) {
        // Remove empty state
        const emptyState = critiqueTimeline.querySelector('.empty-state');
        if (emptyState) {
            critiqueTimeline.innerHTML = '';
        }
        
        const card = document.createElement('div');
        card.className = 'critique-card';
        
        const targetRating = parseInt(targetRatingInput.value);
        const ratingClass = rating >= targetRating ? 'passed' : '';
        
        card.innerHTML = `
            <div class="critique-card-header">
                <span class="critique-card-title">Iteration ${iteration} feedback</span>
                <span class="score-badge ${ratingClass}">${rating}/10 Score</span>
            </div>
            <div class="critique-card-body">
                ${critiqueText.replace(/\n/g, '<br>')}
            </div>
        `;
        
        critiqueTimeline.insertBefore(card, critiqueTimeline.firstChild);
    }

    // Load Run History List
    async function loadHistory() {
        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            
            if (data.length === 0) {
                historyList.innerHTML = `
                    <div class="empty-state">
                        <i data-lucide="folder-open"></i>
                        <p>No previous runs found</p>
                    </div>
                `;
                lucide.createIcons();
                return;
            }
            
            historyList.innerHTML = '';
            data.forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = `history-item ${activeRunId === item.id ? 'active' : ''}`;
                historyItem.dataset.id = item.id;
                
                const targetRating = parseInt(targetRatingInput.value);
                let ratingClass = 'rating-mid';
                if (item.rating >= 8) ratingClass = 'rating-high';
                else if (item.rating < 6) ratingClass = 'rating-low';
                
                const formattedDate = new Date(item.timestamp).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                historyItem.innerHTML = `
                    <div class="history-header">
                        <span class="history-topic" title="${item.topic}">${item.topic}</span>
                        <span class="history-rating ${ratingClass}">${item.rating}/10</span>
                    </div>
                    <div class="history-meta">
                        <span>${item.iterations} iterations</span>
                        <span>${formattedDate}</span>
                    </div>
                `;
                
                historyItem.addEventListener('click', () => displayPastRun(item));
                historyList.appendChild(historyItem);
            });
            
        } catch (err) {
            console.error('Failed to load history:', err);
        }
    }

    // Display details of a historical run
    function displayPastRun(run) {
        activeRunId = run.id;
        
        // Highlight in list
        document.querySelectorAll('.history-item').forEach(item => {
            if (item.dataset.id === run.id) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Reset and populate visuals
        resetGraph();
        completeGraph();
        
        // Populate metrics
        updateMetrics(run.rating, run.iterations, run.article);
        
        // Populate output tabs
        renderMarkdown(run.article);
        
        // Populate critique tab
        critiqueTimeline.innerHTML = '';
        currentCritiques = [];
        
        // Populate logs timeline
        timelineLog.innerHTML = '';
        
        // Parse events log to reconstruct the execution view
        run.events.forEach(evt => {
            if (evt.node === 'search') {
                const searchMsg = evt.messages[0]?.content || '';
                const researchSection = searchMsg.split('Use the research:\n')[1] || '';
                const bulletLines = researchSection.split('\n').filter(l => l.startsWith('-'));
                
                addLogEntry('search', '🔍 Research (Tavily Web Search)', 
                    bulletLines.length > 0 ? bulletLines : 'Performed research query on topic');
            }
            else if (evt.node === 'writer') {
                addLogEntry('writer', `✍️ Draft Generated (Iteration ${evt.iteration})`, 
                    `Writer created article draft. Word count: ${evt.messages[0]?.content?.split(/\s+/).length || 0} words.`);
            }
            else if (evt.node === 'critic') {
                const criticContent = evt.messages[0]?.content || '';
                // Split rating and feedback
                const ratingMatch = criticContent.match(/Editor score:(\d+)\/10/);
                const score = ratingMatch ? parseInt(ratingMatch[1]) : evt.rating;
                
                const feedbackMatch = criticContent.match(/feedback:([\s\S]+?)\n\nRewrite/);
                const feedback = feedbackMatch ? feedbackMatch[1].trim() : criticContent;
                
                addLogEntry('critic', `🧐 Editorial Review (Iteration ${evt.iteration})`, [
                    `<span class="score-badge ${score >= 8 ? 'passed' : ''}">Score: ${score}/10</span>`,
                    `<strong>Editor Feedback:</strong>`,
                    feedback
                ]);
                
                addCritiqueCard(evt.iteration, score, feedback);
            }
        });
        
        addLogEntry('save', '💾 Article Saved', `Saved complete document. Rating: ${run.rating}/10, Iterations: ${run.iterations}`);
        
        // Show Actions footer
        actionsFooter.style.display = 'flex';
        
        // Set up download button URL
        const blob = new Blob([run.article], { type: 'text/markdown' });
        btnDownload.href = URL.createObjectURL(blob);
        btnDownload.download = `${run.topic.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_article.md`;
    }

    // Handle Form Submit (Run Workflow)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (isRunning) return;
        
        const topic = topicInput.value.trim();
        const targetRating = parseInt(targetRatingInput.value);
        const maxIterations = parseInt(maxIterationsInput.value);
        
        if (!topic) return;
        
        // UI Updates for Running state
        isRunning = true;
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Workflow Active...';
        submitBtn.querySelector('i').className = 'btn-icon spin-slow';
        
        systemStatusIndicator.className = 'status-indicator running';
        systemStatusText.textContent = 'Executing...';
        
        // Reset panels
        resetGraph();
        timelineLog.innerHTML = `
            <div class="empty-state">
                <i data-lucide="loader" class="spin-slow"></i>
                <p>Initializing LangGraph workspace...</p>
            </div>
        `;
        lucide.createIcons();
        
        renderedOutput.innerHTML = `
            <div class="empty-state">
                <i data-lucide="edit-3"></i>
                <p>Waiting for Writer draft...</p>
            </div>
        `;
        rawOutput.textContent = 'Waiting for Writer draft...';
        
        critiqueTimeline.innerHTML = `
            <div class="empty-state">
                <i data-lucide="message-square"></i>
                <p>Waiting for Editor critiques...</p>
            </div>
        `;
        lucide.createIcons();
        
        actionsFooter.style.display = 'none';
        updateMetrics(0, 0, '');
        currentCritiques = [];
        
        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    topic,
                    target_rating: targetRating,
                    max_iterations: maxIterations
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP Error! Status: ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep partial line in buffer
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(trimmed.substring(6));
                            handleStreamEvent(data, targetRating);
                        } catch (err) {
                            console.error('Error parsing SSE chunk:', err);
                        }
                    }
                }
            }
            
        } catch (err) {
            console.error('Workflow error:', err);
            addLogEntry('error', '❌ System Error', `An error occurred during agent execution: ${err.message}`);
            systemStatusIndicator.className = 'status-indicator error';
            systemStatusText.textContent = 'System Error';
            
            isRunning = false;
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = 'Initiate Workflow';
            submitBtn.querySelector('i').className = 'btn-icon';
            lucide.createIcons();
        }
    });

    // Parse real-time SSE stream events
    function handleStreamEvent(data, targetRating) {
        if (data.event === 'start') {
            activeRunId = data.run_id;
            nodes.start.className = 'graph-node active';
            addLogEntry('save', '🚀 Workflow Initiated', `Starting Reflector Agent for topic: "${data.topic}" (Target Score: ${data.target_rating}/10, Max Iterations: ${data.max_iterations})`);
        }
        else if (data.event === 'node') {
            const nodeName = data.node;
            updateGraphState(nodeName, data.iteration, data.rating, targetRating);
            
            if (nodeName === 'search') {
                systemStatusText.textContent = 'Researching...';
                // Find research in HumanMessage
                const searchMsg = data.messages[0]?.content || '';
                const researchSection = searchMsg.split('Use the research:\n')[1] || '';
                const bulletLines = researchSection.split('\n').filter(l => l.startsWith('-'));
                
                addLogEntry('search', '🔍 Research (Tavily Web Search)', 
                    bulletLines.length > 0 ? bulletLines : 'Found relevant articles for topic. Seeding draft...');
            }
            else if (nodeName === 'writer') {
                systemStatusText.textContent = 'Writing Draft...';
                const draftContent = data.messages[0]?.content || '';
                
                renderMarkdown(draftContent);
                updateMetrics(0, data.iteration, draftContent);
                
                // Active draft tab
                document.querySelector('[data-tab="preview"]').click();
                
                addLogEntry('writer', `✍️ Draft Generated (Iteration ${data.iteration})`, 
                    `Writer created article draft. Word count: ${draftContent.split(/\s+/).filter(w => w.length > 0).length} words.`);
            }
            else if (nodeName === 'critic') {
                systemStatusText.textContent = 'Critiquing...';
                const criticContent = data.messages[0]?.content || '';
                
                // Parse rating and feedback
                const ratingMatch = criticContent.match(/Editor score:(\d+)\/10/);
                const score = ratingMatch ? parseInt(ratingMatch[1]) : data.rating;
                
                const feedbackMatch = criticContent.match(/feedback:([\s\S]+?)\n\nRewrite/);
                const feedback = feedbackMatch ? feedbackMatch[1].trim() : criticContent;
                
                updateMetrics(score, data.iteration, rawOutput.textContent);
                
                // Format log entry
                addLogEntry('critic', `🧐 Editorial Review (Iteration ${data.iteration})`, [
                    `<span class="score-badge ${score >= targetRating ? 'passed' : ''}">Score: ${score}/10</span>`,
                    `<strong>Editor Feedback:</strong>`,
                    feedback
                ]);
                
                addCritiqueCard(data.iteration, score, feedback);
                
                // Direct focus to critique tab if score is low
                if (score < targetRating) {
                    document.querySelector('[data-tab="critique-history"]').click();
                    
                    if (arrows.criticWriter) {
                        arrows.criticWriter.style.display = 'block';
                        arrows.criticWriter.classList.add('active');
                    }
                    addLogEntry('critic', '🔁 Looping Back', `Score ${score}/10 is below target of ${targetRating}/10. Returning to Writer for revision...`);
                } else {
                    addLogEntry('critic', '✅ Passing Rubric', `Score ${score}/10 meets or exceeds target of ${targetRating}/10. Proceeding to Save...`);
                }
            }
            else if (nodeName === 'save') {
                systemStatusText.textContent = 'Saving Article...';
                addLogEntry('save', '💾 Article Saved', 'Successfully saved final article markdown to outputs/article.md.');
            }
        }
        else if (data.event === 'complete') {
            systemStatusIndicator.className = 'status-indicator success';
            systemStatusText.textContent = 'Completed';
            
            // Final Visual Completes
            completeGraph();
            updateMetrics(data.rating, data.iterations, data.article);
            renderMarkdown(data.article);
            
            addLogEntry('save', '🎉 Process Completed', `Reflector Agent successfully completed in ${data.iterations} iterations. Final rating: ${data.rating}/10.`);
            
            // Setup Download/Copy actions
            actionsFooter.style.display = 'flex';
            const blob = new Blob([data.article], { type: 'text/markdown' });
            btnDownload.href = URL.createObjectURL(blob);
            btnDownload.download = `${topicInput.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}_article.md`;
            
            // Set active tab to Preview
            document.querySelector('[data-tab="preview"]').click();
            
            // Reset run status
            isRunning = false;
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = 'Initiate Workflow';
            submitBtn.querySelector('i').className = 'btn-icon';
            lucide.createIcons();
            
            // Reload history to show this run
            loadHistory();
        }
        else if (data.event === 'error') {
            throw new Error(data.message);
        }
    }

    // Copy to clipboard
    btnCopy.addEventListener('click', () => {
        const text = rawOutput.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const origText = btnCopy.querySelector('span').textContent;
            btnCopy.querySelector('span').textContent = 'Copied!';
            btnCopy.querySelector('i').setAttribute('data-lucide', 'check');
            lucide.createIcons();
            
            setTimeout(() => {
                btnCopy.querySelector('span').textContent = origText;
                btnCopy.querySelector('i').setAttribute('data-lucide', 'copy');
                lucide.createIcons();
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    });

    // Initial Load of History list
    loadHistory();
});
