from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Union
from fastapi.middleware.cors import CORSMiddleware
import copy

app = FastAPI(title="PERT/CPM API", description="API d'ordonnancement de projet")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Task(BaseModel):
    id: int
    nom: str
    duree: int
    date_plus_tot: int = 0
    date_plus_tard: int = 0
    marge: int = 0
    dependances: List[int] = []

class UpdateField(BaseModel):
    value: Union[str, int, List[int]]

tasks = []

@app.get("/")
def home():
    return {"api": "PERT/CPM Ordonnancement", "version": "2.0"}

@app.get("/tasks")
def get_tasks():
    return tasks

@app.post("/tasks")
def create_task(task: Task):
    for t in tasks:
        if t.id == task.id:
            raise HTTPException(status_code=400, detail="ID existe")
    tasks.append(task)
    return {"message": "ok", "task": task}

@app.patch("/tasks/{task_id}/{field}")
def update_task_field(task_id: int, field: str, update: UpdateField):
    task = next((t for t in tasks if t.id == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Tâche non trouvée")
    
    if field == "nom":
        task.nom = str(update.value)
    elif field == "duree":
        task.duree = int(update.value)
    elif field == "dependances":
        task.dependances = update.value if isinstance(update.value, list) else []
    else:
        raise HTTPException(status_code=400, detail="Champ invalide")
    
    # Réinitialiser les dates calculées suite aux changements
    for t in tasks:
        t.date_plus_tot = 0
        t.date_plus_tard = 0
        t.marge = 0
    
    return {"message": "Mis à jour"}

@app.delete("/tasks/{task_id}")
def delete_task(task_id: int):
    global tasks
    task_exists = any(t.id == task_id for t in tasks)
    if not task_exists:
        raise HTTPException(status_code=404, detail="Tâche non trouvée")
    
    tasks = [t for t in tasks if t.id != task_id]
    
    # Nettoyage des références de dépendances orphelines
    for task in tasks:
        task.dependances = [d for d in task.dependances if d != task_id]
    
    return {"message": "Supprimée"}

@app.get("/schedule/earliest")
def calculate_earliest():
    if not tasks:
        return tasks
    
    tasks_copy = copy.deepcopy(tasks)
    
    for _ in range(len(tasks_copy) * 2):
        modified = False
        for task in tasks_copy:
            if len(task.dependances) == 0:
                if task.date_plus_tot != 0:
                    task.date_plus_tot = 0
                    modified = True
            else:
                max_date = 0
                for dep in task.dependances:
                    parent = next((t for t in tasks_copy if t.id == dep), None)
                    if parent:
                        finish = parent.date_plus_tot + parent.duree
                        if finish > max_date:
                            max_date = finish
                if task.date_plus_tot != max_date:
                    task.date_plus_tot = max_date
                    modified = True
        if not modified:
            break
    
    for i, t_orig in enumerate(tasks):
        for t_copy in tasks_copy:
            if t_orig.id == t_copy.id:
                tasks[i].date_plus_tot = t_copy.date_plus_tot
                break
    
    return tasks

@app.get("/schedule/latest")
def calculate_latest():
    if not tasks:
        return tasks
    
    # Forcer la mise à jour des dates au plus tôt au préalable
    calculate_earliest()
    
    # Trouver la fin de projet maximale
    tasks_with_successors = []
    for t in tasks:
        tasks_with_successors.extend(t.dependances)
    last_tasks = [t for t in tasks if t.id not in tasks_with_successors]
    
    project_duration = 0
    for t in last_tasks:
        finish = t.date_plus_tot + t.duree
        if finish > project_duration:
            project_duration = finish
    
    tasks_copy = copy.deepcopy(tasks)
    
    # Initialisation de la date au plus tard par défaut
    for t in tasks_copy:
        t.date_plus_tard = project_duration - t.duree
    
    # Correction de l'algorithme de rétro-propagation (Backward Pass mathématique)
    for _ in range(len(tasks_copy) * 2):
        modified = False
        for task in tasks_copy:
            for dep_id in task.dependances:
                parent = next((t for t in tasks_copy if t.id == dep_id), None)
                if parent:
                    # Le début au plus tard du parent est borné par le début au plus tard du successeur - sa propre durée
                    max_start_for_parent = task.date_plus_tard - parent.duree
                    if max_start_for_parent < parent.date_plus_tard:
                        parent.date_plus_tard = max_start_for_parent
                        modified = True
        if not modified:
            break
    
    for i, t_orig in enumerate(tasks):
        for t_copy in tasks_copy:
            if t_orig.id == t_copy.id:
                tasks[i].date_plus_tard = t_copy.date_plus_tard
                break
    
    return tasks

@app.get("/schedule/margins")
def calculate_margins():
    calculate_earliest()
    calculate_latest()
    
    for task in tasks:
        task.marge = task.date_plus_tard - task.date_plus_tot
    
    return tasks

@app.get("/schedule/critical-path")
def critical_path():
    calculate_margins()
    
    critical_tasks = [t for t in tasks if t.marge == 0]
    return {
        "critical_path": [{"id": t.id, "nom": t.nom, "marge": t.marge} for t in critical_tasks],
        "count": len(critical_tasks)
    }