from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from fastapi.middleware.cors import CORSMiddleware
import copy

app = FastAPI(title="TaskFlow Pro API", description="API d'ordonnancement de projet", version="2.0")

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
    date_plus_tot: int
    date_plus_tard: int
    marge: int
    dependances: List[int]

tasks = []

@app.get("/")
def home():
    return {
        "message": "TaskFlow Pro - Ordonnancement API",
        "version": "2.0",
        "endpoints": [
            "/tasks (GET, POST)",
            "/tasks/{task_id} (DELETE)",
            "/schedule/earliest (GET)",
            "/schedule/latest (GET)",
            "/schedule/margins (GET)",
            "/schedule/critical-path (GET)"
        ]
    }

@app.get("/tasks")
def get_tasks():
    return tasks

@app.post("/tasks")
def create_task(task: Task):
    # Vérifier si l'ID existe déjà
    for t in tasks:
        if t.id == task.id:
            raise HTTPException(status_code=400, detail="ID déjà existant")
    
    # Vérifier si les dépendances existent
    for dep_id in task.dependances:
        if not any(t.id == dep_id for t in tasks):
            raise HTTPException(status_code=400, detail=f"Dépendance {dep_id} inexistante")
    
    tasks.append(task)
    return {"message": "Tâche ajoutée avec succès", "task": task}

@app.delete("/tasks/{task_id}")
def delete_task(task_id: int):
    global tasks
    # Vérifier si la tâche existe
    task_exists = any(t.id == task_id for t in tasks)
    if not task_exists:
        raise HTTPException(status_code=404, detail="Tâche non trouvée")
    
    # Supprimer la tâche
    tasks = [t for t in tasks if t.id != task_id]
    
    # Supprimer les dépendances vers cette tâche dans les autres tâches
    for task in tasks:
        task.dependances = [d for d in task.dependances if d != task_id]
    
    return {"message": "Tâche supprimée avec succès"}

@app.get("/schedule/earliest")
def calculate_earliest_dates():
    if not tasks:
        return {"message": "Aucune tâche à calculer"}
    
    # Copie des tâches pour éviter les modifications pendant le calcul
    tasks_copy = copy.deepcopy(tasks)
    
    # Calcul itératif jusqu'à stabilisation (algorithme de Bellman-Ford simplifié)
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
    
    # Mettre à jour les tâches originales
    for i, task_orig in enumerate(tasks):
        for task_copy in tasks_copy:
            if task_orig.id == task_copy.id:
                tasks[i].date_plus_tot = task_copy.date_plus_tot
                break
    
    return tasks

@app.get("/schedule/latest")
def calculate_latest_dates():
    if not tasks:
        return {"message": "Aucune tâche à calculer"}
    
    # S'assurer que les dates au plus tôt sont calculées
    if not all(t.date_plus_tot > 0 or len(t.dependances) == 0 for t in tasks):
        calculate_earliest_dates()
    
    # Calculer la durée du projet
    project_duration = 0
    tasks_with_successors = []
    for task in tasks:
        tasks_with_successors.extend(task.dependances)
    
    last_tasks = [t for t in tasks if t.id not in tasks_with_successors]
    
    for task in last_tasks:
        finish = task.date_plus_tot + task.duree
        if finish > project_duration:
            project_duration = finish
    
    # Copie des tâches
    tasks_copy = copy.deepcopy(tasks)
    
    # Initialiser les dates au plus tard
    for task in tasks_copy:
        task.date_plus_tard = project_duration - task.duree
    
    # Propagation arrière itérative
    for _ in range(len(tasks_copy)):
        modified = False
        for task in tasks_copy:
            for dep_id in task.dependances:
                for t in tasks_copy:
                    if t.id == dep_id:
                        latest = task.date_plus_tard - t.duree
                        if latest < t.date_plus_tard:
                            t.date_plus_tard = latest
                            modified = True
        if not modified:
            break
    
    # Mettre à jour les tâches originales
    for i, task_orig in enumerate(tasks):
        for task_copy in tasks_copy:
            if task_orig.id == task_copy.id:
                tasks[i].date_plus_tard = task_copy.date_plus_tard
                break
    
    return tasks

@app.get("/schedule/margins")
def calculate_margins():
    if not tasks:
        return {"message": "Aucune tâche à calculer"}
    
    # S'assurer que les dates sont calculées
    calculate_earliest_dates()
    calculate_latest_dates()
    
    for task in tasks:
        task.marge = task.date_plus_tard - task.date_plus_tot
    
    return tasks

@app.get("/schedule/critical-path")
def critical_path():
    if not tasks:
        return {"critical_path": [], "message": "Aucune tâche"}
    
    # Calculer les marges
    calculate_margins()
    
    critical_tasks = []
    for task in tasks:
        if task.marge == 0:
            critical_tasks.append({
                "id": task.id,
                "nom": task.nom,
                "duree": task.duree,
                "date_plus_tot": task.date_plus_tot,
                "date_plus_tard": task.date_plus_tard,
                "marge": task.marge
            })
    
    # Calculer la durée totale du projet
    tasks_with_successors = []
    for task in tasks:
        tasks_with_successors.extend(task.dependances)
    
    last_tasks = [t for t in tasks if t.id not in tasks_with_successors]
    project_duration = 0
    for task in last_tasks:
        finish = task.date_plus_tot + task.duree
        if finish > project_duration:
            project_duration = finish
    
    return {
        "critical_path": critical_tasks,
        "project_duration": project_duration,
        "total_tasks": len(tasks),
        "critical_count": len(critical_tasks)
    }

@app.get("/schedule/reset")
def reset_schedule():
    """Réinitialiser les dates calculées"""
    for task in tasks:
        task.date_plus_tot = 0
        task.date_plus_tard = 0
        task.marge = 0
    return {"message": "Calculs réinitialisés"}

@app.delete("/tasks/all")
def delete_all_tasks():
    """Supprimer toutes les tâches"""
    global tasks
    tasks = []
    return {"message": "Toutes les tâches ont été supprimées"}