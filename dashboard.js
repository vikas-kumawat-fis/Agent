// Agentic SOC Dashboard JavaScript

const API_BASE = window.location.origin || 'http://localhost:8000';
let workflows = [];
let uploadedFiles = [];
let allAlerts = [];
let selectedAlerts = new Set();
let selectedFileId = null;
// Track active WebSocket connections globally
const wsConnections = {};

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
    setupEventListeners();
});

// Initialize dashboard
async function initializeDashboard() {
    await loadMetrics();
}

// Setup event listeners
function setupEventListeners() {
    // Upload file - auto submit on selection
    const uploadInput = document.getElementById('uploadInput');
    if (uploadInput) {
        uploadInput.addEventListener('change', handleFileUpload);
    }

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllWorkflows);
    }

    // Collapse buttons
    const collapseLeftBtn = document.getElementById('collapseLeftBtn');
    if (collapseLeftBtn) {
        collapseLeftBtn.addEventListener('click', toggleLeftPanel);
    }

    const collapseRightBtn = document.getElementById('collapseRightBtn');
    if (collapseRightBtn) {
        collapseRightBtn.addEventListener('click', toggleRightPanel);
    }

    // Select all alerts
    const selectAllAlerts = document.getElementById('selectAllAlerts');
    if (selectAllAlerts) {
        selectAllAlerts.addEventListener('change', handleSelectAll);
    }

    // Start analysis button
    const startAnalysisBtn = document.getElementById('startAnalysisBtn');
    if (startAnalysisBtn) {
        startAnalysisBtn.addEventListener('click', startAnalysis);
    }

    // Modal close
    const closeModalBtn = document.querySelector('.close');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }

    window.addEventListener('click', (e) => {
        const modal = document.getElementById('alertModal');
        if (e.target === modal) {
            closeModal();
        }
    });
}

// Handle file upload (auto-submit)
async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    showLoading(true);
    
    for (let file of files) {
        try {
            const content = await file.text();
            const alerts = JSON.parse(content);
            
            // Store file info
            const fileId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            const fileInfo = {
                id: fileId,
                name: file.name,
                alertCount: Array.isArray(alerts) ? alerts.length : (alerts.alerts ? alerts.alerts.length : 1),
                uploadTime: new Date().toLocaleTimeString(),
                alerts: Array.isArray(alerts) ? alerts : (alerts.alerts || [alerts])
            };
            
            uploadedFiles.push(fileInfo);
            
        } catch (error) {
            console.error('Error processing file:', error);
            // showToast(`Error processing ${file.name}`, 'error');
        }
    }
    
    renderFileList();
    showLoading(false);
    // showToast(`${files.length} file(s) uploaded successfully`, 'success');
    
    // Clear input
    event.target.value = '';
}

// Toggle left panel
function toggleLeftPanel() {
    const panel = document.getElementById('leftPanel');
    const btn = document.getElementById('collapseLeftBtn');
    panel.classList.toggle('collapsed');
    btn.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
}

// Toggle right panel
function toggleRightPanel() {
    const panel = document.getElementById('rightPanel');
    const btn = document.getElementById('collapseRightBtn');
    panel.classList.toggle('collapsed');
    btn.textContent = panel.classList.contains('collapsed') ? '◀' : '▶';
}

// Render file list
function renderFileList() {
    const fileList = document.getElementById('fileList');
    
    if (uploadedFiles.length === 0) {
        fileList.innerHTML = '<div class="empty-message"><p>No files uploaded yet</p></div>';
        return;
    }
    
    fileList.innerHTML = uploadedFiles.map(file => `
        <div class="file-item ${selectedFileId === file.id ? 'selected' : ''}" onclick="selectFile('${file.id}')">
            <div class="file-name">📄 ${file.name}</div>
            <div class="file-info">${file.uploadTime}</div>
            <div class="file-badge">${file.alertCount} alerts</div>
        </div>
    `).join('');
}

// Select file and show its alerts
function selectFile(fileId) {
    selectedFileId = fileId;
    renderFileList();
    
    const file = uploadedFiles.find(f => f.id === fileId);
    if (file) {
        allAlerts = file.alerts.map((alert, index) => ({
            ...alert,
            fileId: fileId,
            alertIndex: index,
            displayId: `${file.name}-${index + 1}`
        }));
        selectedAlerts.clear();
        renderAlertsList();
        updateSelectedCount();
    }
}

// Render alerts list
function renderAlertsList() {
    const alertsList = document.getElementById('alertsList');
    
    if (allAlerts.length === 0) {
        alertsList.innerHTML = '<div class="empty-message"><p>No alerts to display</p><p class="empty-hint">Upload a file to get started</p></div>';
        return;
    }
    
    alertsList.innerHTML = allAlerts.map((alert, index) => {
        const isSelected = selectedAlerts.has(index);
        return `
            <div class="alert-item ${isSelected ? 'selected' : ''}" onclick="toggleAlertSelection(${index}, event)">
                <input type="checkbox" class="alert-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleAlertSelection(${index}, event)">
                <div class="alert-header">
                    <div class="alert-id">${alert.displayId || alert.alert_id || `Alert-${index + 1}`}</div>
                </div>
                <div class="alert-details">
                    <div class="alert-detail-item">
                        <span class="alert-detail-label">Rule:</span>
                        <span class="alert-detail-value">${alert.rule_name || alert.rule_id || 'N/A'}</span>
                    </div>
                    <div class="alert-detail-item">
                        <span class="alert-detail-label">Severity:</span>
                        <span class="alert-detail-value">${alert.severity || 'N/A'}</span>
                    </div>
                    <div class="alert-detail-item">
                        <span class="alert-detail-label">Host:</span>
                        <span class="alert-detail-value">${alert.assets?.host || alert.host || 'N/A'}</span>
                    </div>
                    <div class="alert-detail-item">
                        <span class="alert-detail-label">Source IP:</span>
                        <span class="alert-detail-value">${alert.assets?.source_ip || alert.source_ip || 'N/A'}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Toggle alert selection
function toggleAlertSelection(index, event) {
    if (selectedAlerts.has(index)) {
        selectedAlerts.delete(index);
    } else {
        selectedAlerts.add(index);
    }
    renderAlertsList();
    updateSelectedCount();
    updateStartButton();
}

// Handle select all
function handleSelectAll(event) {
    if (event.target.checked) {
        allAlerts.forEach((_, index) => selectedAlerts.add(index));
    } else {
        selectedAlerts.clear();
    }
    renderAlertsList();
    updateSelectedCount();
    updateStartButton();
}

// Update selected count
function updateSelectedCount() {
    document.getElementById('selectedCount').textContent = `${selectedAlerts.size} selected`;
}

// Update start button state
function updateStartButton() {
    const btn = document.getElementById('startAnalysisBtn');
    btn.disabled = selectedAlerts.size === 0;
}

// Start analysis
async function startAnalysis() {
    if (selectedAlerts.size === 0) {
        // showToast('Please select at least one alert', 'warning');
        return;
    }
    
    const selectedAlertsList = Array.from(selectedAlerts).map(index => allAlerts[index]);
    // Clear previous terminal logs on new analysis start
    addTerminalLog('clear');
    // Ungrouped start message(s)
    addTerminalLog(null, `Starting analysis for ${selectedAlertsList.length} alert(s)...`);
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/alerts/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(selectedAlertsList)
        });
        
        const data = await response.json();
        addTerminalLog(null, `Analysis initiated successfully.\n`);
        
        // Initialize workflow sessions for each workflow
        if (data.workflows) {
            for (let i = 0; i < data.workflows.length; i++) {
                const wf = data.workflows[i];
                const alert = selectedAlertsList[i];
                
                // Create workflow session in terminal
                updateWorkflowSession(wf.workflow_id, alert);
                
                // Connect websocket for real-time updates
                connectWorkflowWebSocket(wf.workflow_id, alert);
            }
        }
        
        // showToast(`Analysis started for ${selectedAlertsList.length} alerts`, 'success');
        
        // Refresh metrics
        setTimeout(() => loadMetrics(), 1000);
        
    } catch (error) {
        console.error('Error starting analysis:', error);
        addTerminalLog('error', `✗ Failed to start analysis: ${error.message}`);
        // showToast('Error starting analysis', 'error');
    } finally {
        showLoading(false);
    }
}

// Load system metrics
async function loadMetrics() {
    try {
        const response = await fetch(`${API_BASE}/api/metrics`);
        const data = await response.json();
        
        document.getElementById('totalProcessed').textContent = data.total_alerts_processed || 0;
        document.getElementById('inProgress').textContent = data.alerts_in_progress || 0;
        document.getElementById('truePositives').textContent = data.true_positives || 0;
        document.getElementById('falsePositives').textContent = data.false_positives || 0;
        document.getElementById('benign').textContent = data.benign || 0;
        document.getElementById('avgMTTR').textContent = formatDuration(data.average_mttr || 0);
    } catch (error) {
        console.error('Error loading metrics:', error);
    }
}

// Store workflow data globally
const workflowData = {};

// Clear terminal
function clearTerminal() {
    const terminalOutput = document.getElementById('terminalOutput');
    terminalOutput.innerHTML = '';
    Object.keys(workflowData).forEach(key => delete workflowData[key]);
}

// Add general log message (not workflow-specific)
function addTerminalLog(stage, message, status = null) {
    const terminalOutput = document.getElementById('terminalOutput');

    // Clear previous logs if "start analysis" is triggered
    if (stage === 'clear') {
        clearTerminal();
        return;
    }

    // Handle ungrouped logs
    if (!stage) {
        const logLine = document.createElement('div');
        logLine.className = 'terminal-line system';
        logLine.innerHTML = `<span class="message">${message}</span>`;
        terminalOutput.appendChild(logLine);
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
        return;
    }
}

// Create or update workflow session in terminal
function updateWorkflowSession(workflowId, alertData) {
    const terminalOutput = document.getElementById('terminalOutput');
    
    // Initialize workflow data if not exists
    if (!workflowData[workflowId]) {
        workflowData[workflowId] = {
            alertId: alertData?.alert_id || 'Unknown',
            rule: alertData?.rule_name || alertData?.rule_id || 'N/A',
            agents: {
                triage: { status: 'Pending', logs: [] },
                investigation: { status: 'Pending', logs: [] },
                decision: { status: 'Pending', logs: [] },
                response: { status: 'Pending', logs: [] }
            },
            verdict: null,
            confidence: null,
            noiseScore: null,
            investigationRequired: null,
            reasoning: null,
            keyIndicators: null,
            decisionResult: null,
            allAgentsCompleted: false
        };
    }

    // Check if session already exists in DOM
    let session = terminalOutput.querySelector(`.workflow-session[data-workflow-id="${workflowId}"]`);
    
    if (!session) {
        // Create new workflow session
        session = document.createElement('div');
        session.className = 'workflow-session';
        session.dataset.workflowId = workflowId;
        terminalOutput.appendChild(session);
    }

    // Render the workflow session
    renderWorkflowSession(session, workflowId);
    
    // Scroll to bottom
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

// Render workflow session HTML
function renderWorkflowSession(sessionElement, workflowId) {
    const data = workflowData[workflowId];
    const shortId = workflowId.substring(0, 8);
    
    let html = `
        <div class="workflow-header" onclick="toggleWorkflowSession('${workflowId}')">
            WORKFLOW SESSION: ${workflowId}
            <span class="workflow-toggle">▼</span>
        </div>

        <div class="workflow-content expanded" id="workflow-content-${workflowId}">
            <div class="workflow-section">
            <div class="workflow-section-title">📌 ALERT DETAILS</div>
            <div class="workflow-field">
                <span class="workflow-label">Alert ID</span>
                <span class="workflow-value">: ${data.alertId}</span>
            </div>
            <div class="workflow-field">
                <span class="workflow-label">Rule</span>
                <span class="workflow-value">: ${data.rule}</span>
            </div>
        </div>

        <div class="workflow-section">
            <div class="workflow-section-title">🔍 AGENTIC SOC WORKFLOW</div>
    `;

    // Add agent collapsible sections
    const agentNames = ['triage', 'investigation', 'decision', 'response'];
    agentNames.forEach((agentName, index) => {
        // Show agent only if it has started (not pending)
        const agent = data.agents[agentName];
        if (agent.status === 'Pending') return; // Skip if still pending

        const displayName = agentName.toUpperCase() + ' AGENT';
        const statusClass = agent.status.toLowerCase() === 'failed' ? 'failed' : 
                           agent.status.toLowerCase() === 'completed' ? 'completed' : 'progress';
        
        html += `
            <div class="collapsible-group" data-workflow="${workflowId}" data-agent="${agentName}">
                <div class="collapsible-header" onclick="toggleCollapsible('${workflowId}', '${agentName}')">
                    <span class="collapsible-toggle">▼</span>
                    <span class="collapsible-title">${displayName}</span>
                    ${agent.status.toLowerCase() === 'in progress' ? '<span class="agent-spinner">⟳</span>' : ''}
                    <span class="collapsible-status ${statusClass}">${agent.status}</span>
                </div>
                <div class="collapsible-content expanded" id="workflow-${workflowId}-${agentName}">
                    ${agent.logs.map(log => `<div class="collapsible-log-line">[${shortId}] ${log}</div>`).join('')}
                    ${agent.logs.length === 0 ? '<div class="collapsible-log-line">No logs available</div>' : ''}
                </div>
            </div>
        `;
    });

    html += `</div>`;

    // Add final verdict section if all agents completed and decision result available
    if (data.allAgentsCompleted && data.decisionResult) {
        const decision = data.decisionResult;
        html += `
            <div class="workflow-section">
                <div class="workflow-section-title">✅ FINAL VERDICT</div>
                <div class="workflow-field">
                    <span class="workflow-label">VERDICT</span>
                    <span class="workflow-value">: ${decision.final_verdict || decision.verdict || 'N/A'}</span>
                </div>
                <div class="workflow-field">
                    <span class="workflow-label">PRIORITY</span>
                    <span class="workflow-value">: ${decision.priority || 'N/A'}</span>
                </div>
                <div class="workflow-field">
                    <span class="workflow-label">CONFIDENCE</span>
                    <span class="workflow-value">: ${decision.confidence || decision.confidence_score || 'N/A'}</span>
                </div>
                <div class="workflow-field">
                    <span class="workflow-label">ESCALATION REQUIRED</span>
                    <span class="workflow-value">: ${decision.escalation_required ? 'YES' : 'NO'}</span>
                </div>
                <div class="workflow-field">
                    <span class="workflow-label">REASONING</span>
                    <span class="workflow-value">: ${decision.reasoning || decision.rationale || 'N/A'}</span>
                </div>
                <div class="workflow-field">
                    <span class="workflow-label">ESTIMATED IMPACT</span>
                    <span class="workflow-value">: ${decision.estimated_impact || 'N/A'}</span>
                </div>
                <div class="workflow-field">
                    <span class="workflow-label">RECOMMENDED ACTIONS</span>
                    <div class="workflow-value">
                        ${decision.recommended_actions && decision.recommended_actions.length > 0
                            ? decision.recommended_actions.map(action => `• ${action}`).join('<br>')
                            : ': N/A'
                        }
                    </div>
                </div>
        `;

        html += `</div>`;
    }

    html += `
        </div>
        <div class="workflow-divider">
            --------------------------------------------------
        </div>
    `;

    sessionElement.innerHTML = html;
}

// Toggle collapsible sections
function toggleCollapsible(workflowId, section) {
    const content = document.getElementById(`workflow-${workflowId}-${section}`);
    const header = content.previousElementSibling;
    const toggle = header.querySelector('.collapsible-toggle');
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        toggle.textContent = '▶';
    } else {
        content.classList.add('expanded');
        toggle.textContent = '▼';
    }
}

// Toggle workflow session
function toggleWorkflowSession(workflowId) {
    const content = document.getElementById(`workflow-content-${workflowId}`);
    const header = content.previousElementSibling;
    const toggle = header.querySelector('.workflow-toggle');
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        toggle.textContent = '▶';
    } else {
        content.classList.add('expanded');
        toggle.textContent = '▼';
    }
}

// Update agent status and logs
function updateAgentStatus(workflowId, agentName, status, logMessage = null) {
    if (!workflowData[workflowId]) return;
    
    const agent = workflowData[workflowId].agents[agentName.toLowerCase()];
    if (!agent) return;
    
    agent.status = status;
    if (logMessage) {
        agent.logs.push(logMessage);
    }
    
    // Check if all agents are completed
    checkAllAgentsCompleted(workflowId);
    
    // Re-render the workflow session
    const session = document.querySelector(`.workflow-session[data-workflow-id="${workflowId}"]`);
    if (session) {
        renderWorkflowSession(session, workflowId);
    }
}

// Check if all agents have completed
function checkAllAgentsCompleted(workflowId) {
    if (!workflowData[workflowId]) return;
    
    const agents = workflowData[workflowId].agents;
    const allCompleted = Object.values(agents).every(agent => 
        agent.status === 'Completed' || agent.status === 'Failed'
    );
    
    if (allCompleted && !workflowData[workflowId].allAgentsCompleted) {
        workflowData[workflowId].allAgentsCompleted = true;
        console.log(`[${workflowId.substring(0, 8)}] All agents completed`);
    }
}

// Update workflow verdict
function updateWorkflowVerdict(workflowId, verdictData) {
    if (!workflowData[workflowId]) return;
    
    workflowData[workflowId].verdict = verdictData.verdict || 'Unknown';
    workflowData[workflowId].confidence = verdictData.confidence || 'N/A';
    workflowData[workflowId].noiseScore = verdictData.noise_score || 'N/A';
    workflowData[workflowId].investigationRequired = verdictData.investigation_required ? 'YES' : 'NO';
    workflowData[workflowId].reasoning = verdictData.reasoning || null;
    workflowData[workflowId].keyIndicators = verdictData.key_indicators || null;
    
    // Re-render the workflow session
    const session = document.querySelector(`.workflow-session[data-workflow-id="${workflowId}"]`);
    if (session) {
        renderWorkflowSession(session, workflowId);
    }
}

// Connect to WebSocket for a workflow and handle live updates
function connectWorkflowWebSocket(workflowId, alertData) {
    if (!workflowId || wsConnections[workflowId]) return; // already connected
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws/${workflowId}`;
    const shortId = workflowId.substring(0, 8);
    
    console.log(`[WS:${shortId}] Connecting to WebSocket: ${wsUrl}`);
    
    try {
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
            console.log(`[WS:${shortId}] WebSocket connection opened successfully`);
            wsConnections[workflowId] = ws;
            // Optionally send a ping
            try { 
                ws.send('ping');
                console.log(`[WS:${shortId}] Sent initial ping`);
            } catch (pingError) {
                console.warn(`[WS:${shortId}] Failed to send initial ping:`, pingError);
            }
        };
        // Handle WebSocket messages and update workflow session
        ws.onmessage = (evt) => {
            console.log(`[WS:${shortId}] Received message:`, evt.data);
            let msg = null;
            try { 
                msg = JSON.parse(evt.data);
                console.log(`[WS:${shortId}] Parsed message:`, msg);
            } catch (parseError) {
                console.warn(`[WS:${shortId}] Failed to parse message as JSON:`, parseError);
                return;
            }

            // Log full JSON payload for agent result messages
            if (msg.result) {
                console.log(`[WS:${shortId}] Agent ${msg.stage} result:`, JSON.stringify(msg.result, null, 2));
                
                // Store decision agent result separately
                let agentName = msg.stage.toLowerCase();
                if (agentName === 'respond') agentName = 'response';
                
                if (agentName === 'decision' && workflowData[workflowId]) {
                    workflowData[workflowId].decisionResult = msg.result;
                    console.log(`[WS:${shortId}] Stored decision result:`, msg.result);
                }
                
                // Add to agent logs in the UI
                if (workflowData[workflowId] && workflowData[workflowId].agents[agentName]) {
                    workflowData[workflowId].agents[agentName].logs.push(`Result: ${JSON.stringify(msg.result, null, 2)}`);
                    // Re-render the workflow session to show the new log
                    const session = document.querySelector(`.workflow-session[data-workflow-id="${workflowId}"]`);
                    if (session) {
                        renderWorkflowSession(session, workflowId);
                    }
                }
            }

            // Update agent status based on message type
            if (msg.stage) {
                let agentName = msg.stage.toLowerCase();
                // Normalize stage names
                if (agentName === 'respond') agentName = 'response';
                
                let status = 'In Progress';
                let logMessage = null;

                console.log(`[WS:${shortId}] Processing agent stage: ${msg.stage}, type: ${msg.type}`);

                if (msg.type === 'progress' || msg.status) {
                    if (msg.status) {
                        // Capitalize the status for display
                        status = msg.status.charAt(0).toUpperCase() + msg.status.slice(1);
                    }
                    logMessage = msg.message || msg.status || 'Status update';
                }
                
                if (msg.type === 'agent_output' && msg.details) {
                    logMessage = msg.details;
                    // Keep existing status unless specified
                }

                updateAgentStatus(workflowId, agentName, status, logMessage);
            }

            // Handle final verdict/decision
             if (msg.type === 'final' || (msg.stage === 'decision' && msg.verdict)) {
                console.log(`[WS:${shortId}] Processing final verdict:`, msg.verdict || msg.final_verdict);
                const verdictData = {
                     verdict: msg.verdict || msg.final_verdict || 'Unknown',
                    confidence: msg.confidence || msg.confidence_score,
                    noise_score: msg.noise_score,
                    investigation_required: msg.investigation_required || false,
                    reasoning: msg.reasoning || msg.justification,
                    key_indicators: msg.key_indicators ? (Array.isArray(msg.key_indicators) ? msg.key_indicators.join(', ') : msg.key_indicators) : null
                };
                updateWorkflowVerdict(workflowId, verdictData);
                
                // Refresh metrics and close connection
                console.log(`[WS:${shortId}] Workflow completed, closing WebSocket connection`);
                loadMetrics();
                try { ws.close(); } catch {}
                delete wsConnections[workflowId];
            }

            // Handle errors
            if (msg.type === 'error') {
                console.error(`[WS:${shortId}] Error message received:`, msg.message || 'Unknown error');
                const agentName = msg.stage ? msg.stage.toLowerCase() : null;
                if (agentName) {
                    updateAgentStatus(workflowId, agentName, 'Failed', `Error: ${msg.message || 'Unknown error'}`);
                }
            }
        };
        ws.onerror = (error) => {
            console.error(`[WS:${shortId}] WebSocket error occurred:`, error);
        };
        ws.onclose = (event) => {
            console.log(`[WS:${shortId}] WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
            delete wsConnections[workflowId];
        };
    } catch (e) {
        console.error(`[WS:${shortId}] Failed to create WebSocket connection:`, e);
    }
}

// Keep for backward compatibility but not actively used in new UI
function renderWorkflowsTable(workflowsList) {
    // This function is kept for potential future use or API compatibility
    console.log('Workflows loaded:', workflowsList.length);
}

// View alert details
async function viewAlertDetails(workflowId) {
    try {
        const response = await fetch(`${API_BASE}/api/alerts/status/${workflowId}?include_details=true`);
        const data = await response.json();
        
        renderAlertDetails(data);
        document.getElementById('alertModal').style.display = 'block';
    } catch (error) {
        console.error('Error loading alert details:', error);
        // showToast('Error loading alert details', 'error');
    }
}

// Render alert details in modal
function renderAlertDetails(data) {
    const workflow = data.workflow;
    const details = data.details;
    
    let html = `
        <div class="detail-section">
            <h3>Alert Information</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Alert ID</div>
                    <div class="detail-value"><code>${workflow.alert_id}</code></div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Workflow ID</div>
                    <div class="detail-value"><code>${workflow.workflow_id}</code></div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">
                        <span class="status-badge status-${workflow.status}">${workflow.status}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Processing Time</div>
                    <div class="detail-value">${workflow.processing_time_seconds ? formatDuration(workflow.processing_time_seconds) : 'In progress'}</div>
                </div>
            </div>
        </div>
    `;
    
    if (details && details.alert) {
        html += `
            <div class="detail-section">
                <h3>Alert Details</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Rule</div>
                        <div class="detail-value">${details.alert.rule_name || details.alert.rule_id}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Severity</div>
                        <div class="detail-value">${details.alert.severity}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Host</div>
                        <div class="detail-value">${details.alert.assets?.host || 'N/A'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Source IP</div>
                        <div class="detail-value">${details.alert.assets?.source_ip || 'N/A'}</div>
                    </div>
                </div>
                <div class="detail-item" style="margin-top: 1rem;">
                    <div class="detail-label">Description</div>
                    <div class="detail-value">${details.alert.description}</div>
                </div>
            </div>
        `;
    }
    
    if (details && details.triage) {
        html += `
            <div class="detail-section">
                <h3>🔍 Triage Assessment</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Verdict</div>
                        <div class="detail-value">
                            <span class="verdict-badge verdict-${details.triage.verdict}">
                                ${formatVerdict(details.triage.verdict)}
                            </span>
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Confidence</div>
                        <div class="detail-value">${(details.triage.confidence * 100).toFixed(0)}%</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Noise Score</div>
                        <div class="detail-value">${(details.triage.noise_score * 100).toFixed(0)}%</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Investigation Required</div>
                        <div class="detail-value">${details.triage.requires_investigation ? '✓ Yes' : '✗ No'}</div>
                    </div>
                </div>
                <div class="detail-item" style="margin-top: 1rem;">
                    <div class="detail-label">Reasoning</div>
                    <div class="detail-value">${details.triage.reasoning}</div>
                </div>
                ${details.triage.key_indicators && details.triage.key_indicators.length > 0 ? `
                    <div class="detail-item" style="margin-top: 1rem;">
                        <div class="detail-label">Key Indicators</div>
                        <ul class="detail-list">
                            ${details.triage.key_indicators.map(ind => `<li>${ind}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    if (details && details.investigation) {
        html += `
            <div class="detail-section">
                <h3>🔬 Investigation Results</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Risk Score</div>
                        <div class="detail-value">${details.investigation.risk_score.toFixed(1)}/10</div>
                    </div>
                </div>
                ${details.investigation.findings && details.investigation.findings.length > 0 ? `
                    <div class="detail-item" style="margin-top: 1rem;">
                        <div class="detail-label">Findings</div>
                        <ul class="detail-list">
                            ${details.investigation.findings.map(finding => `<li>${finding}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                ${details.investigation.attack_chain && details.investigation.attack_chain.length > 0 ? `
                    <div class="detail-item" style="margin-top: 1rem;">
                        <div class="detail-label">Attack Chain</div>
                        <div class="detail-value">${details.investigation.attack_chain.join(' → ')}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    if (details && details.decision) {
        html += `
            <div class="detail-section">
                <h3>⚖️ Final Decision</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Verdict</div>
                        <div class="detail-value">
                            <span class="verdict-badge verdict-${details.decision.final_verdict}">
                                ${formatVerdict(details.decision.final_verdict)}
                            </span>
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Priority</div>
                        <div class="detail-value">
                            <span class="priority-badge priority-${details.decision.priority}">
                                ${details.decision.priority}
                            </span>
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Confidence</div>
                        <div class="detail-value">${(details.decision.confidence * 100).toFixed(0)}%</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Escalation Required</div>
                        <div class="detail-value">${details.decision.escalation_required ? '✓ Yes' : '✗ No'}</div>
                    </div>
                </div>
                <div class="detail-item" style="margin-top: 1rem;">
                    <div class="detail-label">Rationale</div>
                    <div class="detail-value">${details.decision.rationale}</div>
                </div>
                <div class="detail-item" style="margin-top: 1rem;">
                    <div class="detail-label">Estimated Impact</div>
                    <div class="detail-value">${details.decision.estimated_impact}</div>
                </div>
                ${details.decision.recommended_actions && details.decision.recommended_actions.length > 0 ? `
                    <div class="detail-item" style="margin-top: 1rem;">
                        <div class="detail-label">Recommended Actions</div>
                        <ul class="detail-list">
                            ${details.decision.recommended_actions.map(action => `<li>${action}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    if (details && details.response) {
        html += `
            <div class="detail-section">
                <h3>🚨 Response Actions</h3>
                ${details.response.ticket_id ? `
                    <div class="detail-item">
                        <div class="detail-label">Ticket ID</div>
                        <div class="detail-value"><code>${details.response.ticket_id}</code></div>
                    </div>
                ` : ''}
                <div class="detail-item" style="margin-top: 1rem;">
                    <div class="detail-label">Summary</div>
                    <div class="detail-value">${details.response.summary}</div>
                </div>
                ${details.response.actions_taken && details.response.actions_taken.length > 0 ? `
                    <div class="detail-item" style="margin-top: 1rem;">
                        <div class="detail-label">Actions Taken</div>
                        <ul class="detail-list">
                            ${details.response.actions_taken.map(action => `<li>${action}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                ${details.response.notifications_sent && details.response.notifications_sent.length > 0 ? `
                    <div class="detail-item" style="margin-top: 1rem;">
                        <div class="detail-label">Notifications Sent</div>
                        <ul class="detail-list">
                            ${details.response.notifications_sent.map(notif => `<li>${notif}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    document.getElementById('alertDetailContent').innerHTML = html;
}

// Load sample alerts - simplified version
async function loadSampleAlerts() {
    addTerminalLog('system', 'Loading sample alerts...');
    // This can be extended if needed
}

// Clear all workflows
async function clearAllWorkflows() {
    if (!confirm('Are you sure you want to clear all data? This will remove all uploaded files and workflows.')) {
        return;
    }
    
    try {
        showLoading(true);
        const activeConnections = Object.keys(wsConnections).length;
        console.log(`[WS] Clearing all workflows. Active WebSocket connections: ${activeConnections}`);
        addTerminalLog('system', 'Clearing all data...');
        
        await fetch(`${API_BASE}/api/workflows/clear`, { method: 'DELETE' });
        
        // Clear local data
        uploadedFiles = [];
        allAlerts = [];
        selectedAlerts.clear();
        selectedFileId = null;
        
        // Clear UI
        renderFileList();
        renderAlertsList();
        updateSelectedCount();
        updateStartButton();
        
        // Clear terminal
        document.getElementById('terminalOutput').innerHTML = `
            <div class="terminal-line system">
                <span class="message">Agent terminal ready. Waiting for analysis...</span>
            </div>
        `;
        
        // showToast('All data cleared', 'success');
        addTerminalLog('success', '✓ All data cleared successfully');
        
        await loadMetrics();
        
        showLoading(false);
    } catch (error) {
        console.error('Error clearing workflows:', error);
        // showToast('Error clearing workflows', 'error');
        addTerminalLog('error', `✗ Error clearing data: ${error.message}`);
        showLoading(false);
    }
}

// Close modal
function closeModal() {
    document.getElementById('alertModal').style.display = 'none';
}

// Show loading overlay
function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

// // Show toast notification
// function showToast(message, type = 'info') {
//     const container = document.getElementById('toastContainer');
//     const toast = document.createElement('div');
//     toast.className = `toast ${type}`;
//     toast.textContent = message;
    
//     container.appendChild(toast);
    
//     setTimeout(() => {
//         toast.remove();
//     }, 4000);
// }

// Utility functions
function formatDuration(seconds) {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
}

function formatVerdict(verdict) {
    return verdict.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function truncate(str, maxLength) {
    if (!str) return 'N/A';
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

// Function to handle 'Details' link click and display alert information
function viewAlertDetailsPopup(alertId) {
    const alert = allAlerts.find(a => a.id === alertId);
    if (!alert) {
        console.error('Alert not found:', alertId);
        return;
    }

    const modalContent = document.getElementById('alertDetailContent');
    modalContent.innerHTML = `
        <div class="detail-section">
            <h3>Alert Information</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Alert ID</div>
                    <div class="detail-value">${alert.id}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Priority</div>
                    <div class="detail-value">${alert.priority}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">${alert.status}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Description</div>
                    <div class="detail-value">${alert.description}</div>
                </div>
            </div>
        </div>
    `;

    const modal = document.getElementById('alertModal');
    modal.style.display = 'block';
}

// Close modal when clicking outside or on close button
window.addEventListener('click', (event) => {
    const modal = document.getElementById('alertModal');
    if (event.target === modal || event.target.classList.contains('close')) {
        modal.style.display = 'none';
    }
});
