// script.js
const API = "http://127.0.0.1:8000";
let statsChart = null;
let currentTasks = [];

// ================== GESTION DU THÈME (logique inversée) ==================
const themeToggle = document.getElementById('themeToggle');
const body = document.body;
// On veut : cercle à gauche (checkbox décoché) = Light, cercle à droite (coché) = Dark
if (localStorage.getItem('theme') === 'light') {
    body.classList.remove('dark');
    body.classList.add('light');
    themeToggle.checked = false;   // décoché = cercle à gauche = light
} else {
    body.classList.remove('light');
    body.classList.add('dark');
    themeToggle.checked = true;    // coché = cercle à droite = dark
}
themeToggle.addEventListener('change', () => {
    if (themeToggle.checked) {
        // coché -> dark (cercle à droite)
        body.classList.replace('light', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        // décoché -> light (cercle à gauche)
        body.classList.replace('dark', 'light');
        localStorage.setItem('theme', 'light');
    }
    if (statsChart) {
        const newColor = body.classList.contains('light') ? '#2e3440' : '#c0caf5';
        statsChart.options.plugins.legend.labels.color = newColor;
        statsChart.update();
    }
});

function showNotification(msg, isError = false) {
    const notif = document.getElementById("notif");
    notif.innerHTML = `<i class="fas fa-${isError ? 'exclamation-triangle' : 'check-circle'}"></i> ${msg}`;
    notif.classList.remove("hidden");
    setTimeout(() => notif.classList.add("hidden"), 3000);
}

// ================== GESTION DES TÂCHES ==================
async function loadTasks() {
    try {
        const res = await fetch(API + "/tasks");
        currentTasks = await res.json();
        renderTasksTable();
        document.getElementById("taskStats").innerHTML = `${currentTasks.length} tâche(s)`;
    } catch (error) { showNotification("Erreur de connexion au serveur", true); }
}

function renderTasksTable() {
    const container = document.getElementById("tasksTableContainer");
    if (!container) return;
    if (currentTasks.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#565f89;">Aucune tâche définie</div>'; return; }
    let successors = {};
    currentTasks.forEach(t => successors[t.nom] = []);
    currentTasks.forEach(t => {
        t.dependances.forEach(depId => {
            const parent = currentTasks.find(p => p.id === depId);
            if (parent) successors[parent.nom].push(t.nom);
        });
    });
    let html = `<table class="uniform-table"><thead><tr><th>NOM</th><th>DURÉE</th><th>ANTÉRIEURES</th><th>SUCCESSEURS</th><th>ACTION</th></tr></thead><tbody>`;
    for (const task of currentTasks) {
        const antérieures = task.dependances.map(depId => { const t = currentTasks.find(p => p.id === depId); return t ? t.nom : ""; }).filter(n => n).join(", ") || "-";
        const successeursList = successors[task.nom].join(", ") || "FIN";
        html += `<tr data-id="${task.id}" data-nom="${task.nom}">
            <td class="editable" data-field="nom" data-value="${task.nom}">${task.nom}</td>
            <td class="editable" data-field="duree" data-value="${task.duree}">${task.duree}</td>
            <td class="editable" data-field="dependances" data-value="${antérieures}">${antérieures}</td>
            <td>${successeursList}</td>
            <td><button class="delete-btn" onclick="deleteTask(${task.id}, '${task.nom}')"><i class="fas fa-trash"></i> Supprimer</button></td>
          </tr>`;
    }
    html += `</tbody>`;
    container.innerHTML = html;
    document.querySelectorAll('.editable').forEach(el => { el.addEventListener('click', (e) => { e.stopPropagation(); makeEditable(el); }); });
}

function makeEditable(element) {
    if (element.querySelector('input')) return;
    const field = element.dataset.field;
    const currentValue = element.dataset.value;
    const taskId = parseInt(element.closest('tr').dataset.id);
    let inputHtml = field === 'dependances' ? `<input type="text" class="editable-input" value="${currentValue}" placeholder="A,B,C">` : `<input type="${field === 'duree' ? 'number' : 'text'}" class="editable-input" value="${currentValue}">`;
    element.innerHTML = inputHtml;
    const input = element.querySelector('input');
    input.focus();
    const save = async () => {
        let newValue = input.value.trim();
        if (newValue === "") newValue = field === 'duree' ? "0" : "-";
        if (field === 'dependances') {
            const depNames = newValue.split(',').map(s => s.trim()).filter(s => s);
            const depIds = [];
            for (const name of depNames) {
                const task = currentTasks.find(t => t.nom === name);
                if (task) depIds.push(task.id);
                else if (name) showNotification(`Tâche "${name}" non trouvée`, true);
            }
            await updateTaskField(taskId, field, depIds);
        } else if (field === 'duree') {
            const newDuree = parseInt(newValue);
            if (!isNaN(newDuree)) await updateTaskField(taskId, field, newDuree);
        } else {
            await updateTaskField(taskId, field, newValue);
        }
        await loadTasks();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') save(); });
}

async function updateTaskField(taskId, field, value) {
    try {
        await fetch(`${API}/tasks/${taskId}/${field}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: value }) });
        showNotification("Tâche modifiée");
    } catch (error) { showNotification("Erreur modification", true); }
}

async function addTask() {
    const nom = document.getElementById("nom").value.trim();
    const duree = parseInt(document.getElementById("duree").value);
    if (!nom || isNaN(duree)) { showNotification("Nom et durée requis", true); return; }
    try {
        const res = await fetch(API + "/tasks");
        const existingTasks = await res.json();
        const depNames = document.getElementById("dependances").value.split(",").map(s => s.trim()).filter(s => s);
        const dependances = [];
        for (const name of depNames) {
            const t = existingTasks.find(x => x.nom === name);
            if (t) dependances.push(t.id);
            else if (name) showNotification(`Tâche "${name}" non trouvée`, true);
        }
        const newId = Date.now();
        await fetch(API + "/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: newId, nom, duree, dependances, date_plus_tot: 0, date_plus_tard: 0, marge: 0 }) });
        document.getElementById("nom").value = ""; document.getElementById("duree").value = ""; document.getElementById("dependances").value = "";
        await loadTasks();
        showNotification(`Tâche "${nom}" ajoutée`);
    } catch (error) { showNotification("Erreur lors de l'ajout", true); }
}

async function deleteTask(id, nom) {
    if (confirm(`Supprimer "${nom}" ?`)) {
        await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
        await loadTasks();
        showNotification(`"${nom}" supprimée`);
    }
}

async function goToPage2() {
    showNotification("Calcul en cours...");
    await refreshResults();
    document.getElementById("page1").classList.add("hidden");
    document.getElementById("page2").classList.remove("hidden");
}

function goBack() {
    document.getElementById("page2").classList.add("hidden");
    document.getElementById("page1").classList.remove("hidden");
}

async function refreshResults() {
    try {
        await fetch(API + "/schedule/earliest");
        await fetch(API + "/schedule/latest");
        await fetch(API + "/schedule/margins");
        await loadTasks();
        await renderEarliestFlowTable();
        await renderLatestFlowTable();
        await renderCriticalPath();
        await updateStatsAndChart();
        showNotification("Calcul terminé");
    } catch (error) { showNotification("Erreur de calcul", true); }
}

// ========== DATES AU PLUS TÔT ==========
async function renderEarliestFlowTable() {
    const res = await fetch(API + "/tasks");
    const tasks = await res.json();
    const tasksWithSuccessors = new Set();
    tasks.forEach(t => t.dependances.forEach(d => tasksWithSuccessors.add(d)));
    const lastTasks = tasks.filter(t => !tasksWithSuccessors.has(t.id));
    let maxEnd = 0;
    lastTasks.forEach(t => { const end = t.date_plus_tot + t.duree; if (end > maxEnd) maxEnd = end; });
    const container = document.getElementById("earliestFlowTable");
    container.innerHTML = "";
    tasks.forEach(task => {
        const block = document.createElement("div");
        block.className = "task-block";
        const isCritical = task.marge === 0;
        if (isCritical) block.classList.add("critical-block");
        let html = `<table><tr class="top-row"><td colspan="2"><span class="earliest-bold">${task.date_plus_tot}</span> &nbsp; ${task.nom}</td></tr>`;
        if (task.dependances.length === 0) {
            html += `<tr><td class="earliest-bold">0</td><td class="split">DÉBUT 0</td></tr>`;
        } else {
            for (const depId of task.dependances) {
                const parent = tasks.find(t => t.id === depId);
                if (parent) {
                    html += `<tr><td class="earliest-bold">${parent.date_plus_tot}</td><td class="split">${parent.nom} ${parent.duree}</td></tr>`;
                }
            }
        }
        html += `</table>`;
        block.innerHTML = html;
        container.appendChild(block);
    });
    const endBlock = document.createElement("div");
    endBlock.className = "task-block";
    let endHtml = `<table><tr class="top-row"><td colspan="2"><span class="earliest-bold">${maxEnd}</span> FIN</td></tr>`;
    for (const t of lastTasks) {
        endHtml += `<tr><td class="earliest-bold">${t.date_plus_tot}</td><td class="split">${t.nom} ${t.duree}</td></tr>`;
    }
    endHtml += `</table>`;
    endBlock.innerHTML = endHtml;
    container.appendChild(endBlock);
}

// ========== DATES AU PLUS TARD ==========
async function renderLatestFlowTable() {
    const res = await fetch(API + "/tasks");
    const tasks = await res.json();
    let successorsMap = {};
    tasks.forEach(t => successorsMap[t.nom] = []);
    tasks.forEach(task => {
        task.dependances.forEach(depId => {
            const parent = tasks.find(t => t.id === depId);
            if (parent) successorsMap[parent.nom].push(task);
        });
    });
    const tasksWithSuccessors = new Set();
    tasks.forEach(t => t.dependances.forEach(d => tasksWithSuccessors.add(d)));
    const lastTasks = tasks.filter(t => !tasksWithSuccessors.has(t.id));
    let maxEnd = 0;
    lastTasks.forEach(t => { const end = t.date_plus_tot + t.duree; if (end > maxEnd) maxEnd = end; });
    let latestMap = {};
    lastTasks.forEach(t => { latestMap[t.nom] = maxEnd - t.duree; });
    let changed = true;
    while (changed) {
        changed = false;
        for (const task of tasks) {
            const successors = successorsMap[task.nom];
            if (successors.length > 0) {
                let minVal = Infinity;
                for (const s of successors) {
                    const val = latestMap[s.nom] !== undefined ? latestMap[s.nom] - task.duree : Infinity;
                    if (val < minVal) minVal = val;
                }
                if (minVal !== Infinity && (latestMap[task.nom] === undefined || minVal < latestMap[task.nom])) {
                    latestMap[task.nom] = minVal;
                    changed = true;
                }
            }
        }
    }
    for (const task of tasks) if (latestMap[task.nom] === undefined) latestMap[task.nom] = 0;
    const container = document.getElementById("latestFlowTable");
    container.innerHTML = "";
    const startBlock = document.createElement("div");
    startBlock.className = "task-block";
    let startHtml = `<table><tr class="top-row"><td colspan="2"><span class="latest-bold">0</span> DÉBUT</td></tr>`;
    const startTasks = tasks.filter(t => t.dependances.length === 0);
    startTasks.forEach(t => { startHtml += `<tr><td class="latest-bold">${latestMap[t.nom] ?? 0}</td><td class="split">${t.nom} 0</td></tr>`; });
    startHtml += `</table>`;
    startBlock.innerHTML = startHtml;
    container.appendChild(startBlock);
    for (const task of tasks) {
        const block = document.createElement("div");
        block.className = "task-block";
        const isCritical = task.marge === 0;
        if (isCritical) block.classList.add("critical-block");
        let html = `<table><tr class="top-row"><td colspan="2"><span class="latest-bold">${latestMap[task.nom] ?? 0}</span> &nbsp; ${task.nom}</td></tr>`;
        const successors = successorsMap[task.nom];
        if (successors.length === 0) {
            html += `<tr><td class="latest-bold">${maxEnd}</td><td class="split">FIN ${task.duree}</td></tr>`;
        } else {
            for (const s of successors) {
                html += `<tr><td class="latest-bold">${latestMap[s.nom] ?? 0}</td><td class="split">${s.nom} ${task.duree}</td></tr>`;
            }
        }
        html += `</table>`;
        block.innerHTML = html;
        container.appendChild(block);
    }
}

// ========== CHEMIN CRITIQUE avec animation dynamique ==========
async function renderCriticalPath() {
    const res = await fetch(API + "/tasks");
    const tasks = await res.json();
    if (tasks.length === 0) {
        document.getElementById("criticalTable").innerHTML = '<div style="text-align:center;padding:40px;">Aucune tâche</div>';
        document.getElementById("criticalGraph").innerHTML = '<div style="text-align:center;padding:40px;">Aucune tâche</div>';
        return;
    }
    const criticalParents = {};
    for (const task of tasks) {
        if (task.dependances.length === 0) {
            criticalParents[task.nom] = "DEBUT";
        } else {
            let maxVal = -1, bestParent = null;
            for (const depId of task.dependances) {
                const parent = tasks.find(t => t.id === depId);
                if (parent) {
                    const val = parent.date_plus_tot + parent.duree;
                    if (val > maxVal) { maxVal = val; bestParent = parent.nom; }
                }
            }
            criticalParents[task.nom] = bestParent;
        }
    }
    const tasksWithSuccessors = new Set();
    tasks.forEach(t => t.dependances.forEach(d => tasksWithSuccessors.add(d)));
    const lastTasks = tasks.filter(t => !tasksWithSuccessors.has(t.id));
    let maxEnd = 0, bestLast = null;
    for (const t of lastTasks) {
        const val = t.date_plus_tot + t.duree;
        if (val > maxEnd) { maxEnd = val; bestLast = t.nom; }
    }
    let criticalSet = new Set();
    let current = bestLast;
    while (current && current !== "DEBUT") { criticalSet.add(current); current = criticalParents[current]; }
    const container = document.getElementById("criticalTable");
    container.innerHTML = "";
    tasks.forEach(task => {
        const block = document.createElement("div");
        block.className = "task-block";
        const isCritical = criticalSet.has(task.nom);
        if (isCritical) block.classList.add("critical-block");
        let html = `<table><tr class="top-row"><td colspan="2"><span class="earliest-bold">${task.date_plus_tot}</span> &nbsp; ${task.nom}</td></tr>`;
        if (task.dependances.length === 0) {
            html += `<tr><td class="earliest-bold">0</td><td class="split ${isCritical ? 'critical-bold' : ''}">DÉBUT 0</td></tr>`;
        } else {
            for (const depId of task.dependances) {
                const parent = tasks.find(t => t.id === depId);
                if (parent) {
                    const isCriticalLink = criticalParents[task.nom] === parent.nom && criticalSet.has(task.nom);
                    html += `<tr><td class="earliest-bold ${isCriticalLink ? 'critical-bold' : ''}">${parent.date_plus_tot}</td>
                             <td class="split ${isCriticalLink ? 'critical-bold' : ''}">${parent.nom} ${parent.duree}</td></tr>`;
                }
            }
        }
        html += `</table>`;
        block.innerHTML = html;
        container.appendChild(block);
    });
    const endBlock = document.createElement("div");
    endBlock.className = "task-block";
    let endHtml = `<table><tr class="top-row"><td colspan="2"><span class="earliest-bold">${maxEnd}</span> FIN</td></tr>`;
    for (const t of lastTasks) {
        const isCritical = (t.nom === bestLast);
        endHtml += `<tr><td class="earliest-bold ${isCritical ? 'critical-bold' : ''}">${t.date_plus_tot}</td>
                        <td class="split ${isCritical ? 'critical-bold' : ''}">${t.nom} ${t.duree}</td></tr>`;
    }
    endHtml += `</table>`;
    endBlock.innerHTML = endHtml;
    container.appendChild(endBlock);

    // Graphe animé du chemin critique
    const graphContainer = document.getElementById("criticalGraph");
    let orderedPath = [];
    let node = bestLast;
    while (node && node !== "DEBUT") { orderedPath.unshift(node); node = criticalParents[node]; }
    if (orderedPath.length === 0) { graphContainer.innerHTML = '<div style="color:#565f89; text-align:center;">Aucun chemin critique identifié</div>'; return; }
    let graphHtml = `<div class="path-node start-node"><div class="node-name">DÉBUT</div><div class="node-duration">0</div></div>`;
    for (let i = 0; i < orderedPath.length; i++) {
        const t = tasks.find(x => x.nom === orderedPath[i]);
        if (!t) continue;
        let arrowDuration = 0;
        if (i > 0) { const prevTask = tasks.find(x => x.nom === orderedPath[i-1]); if (prevTask) arrowDuration = prevTask.duree; }
        graphHtml += `<div class="path-arrow"><i class="fas fa-long-arrow-alt-right"></i><span class="duration-label">${arrowDuration}</span></div>`;
        graphHtml += `<div class="path-node"><div class="node-name">${t.nom}</div><div class="node-duration">${t.date_plus_tot}</div></div>`;
    }
    const lastTask = tasks.find(x => x.nom === orderedPath[orderedPath.length-1]);
    const lastDuration = lastTask ? lastTask.duree : 0;
    graphHtml += `<div class="path-arrow"><i class="fas fa-long-arrow-alt-right"></i><span class="duration-label">${lastDuration}</span></div>`;
    graphHtml += `<div class="path-node end-node"><div class="node-name">FIN</div><div class="node-duration">${maxEnd}</div></div>`;
    graphContainer.innerHTML = graphHtml;
}

function getProjectEnd(tasks) {
    const tasksWithSuccessors = new Set();
    tasks.forEach(t => t.dependances.forEach(d => tasksWithSuccessors.add(d)));
    const lastTasks = tasks.filter(t => !tasksWithSuccessors.has(t.id));
    let maxEnd = 0;
    lastTasks.forEach(t => { const end = t.date_plus_tot + t.duree; if (end > maxEnd) maxEnd = end; });
    return maxEnd;
}

async function updateStatsAndChart() {
    const res = await fetch(API + "/tasks");
    const tasks = await res.json();
    const total = tasks.length;
    const critical = tasks.filter(t => t.marge === 0).length;
    const duration = getProjectEnd(tasks);
    document.getElementById("statTotal").innerHTML = total;
    document.getElementById("statCritical").innerHTML = critical;
    document.getElementById("statDuration").innerHTML = duration;
    const ctx = document.getElementById('statsChart').getContext('2d');
    if (statsChart) statsChart.destroy();
    const isLight = body.classList.contains('light');
    // Couleurs : rouge pour critiques, bleu pour non critiques
    statsChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['Tâches critiques', 'Tâches non critiques'], datasets: [{ data: [critical, total - critical], backgroundColor: ['#ef4444', '#3b82f6'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { color: isLight ? '#2e3440' : '#c0caf5' } } } }
    });
}

loadTasks();