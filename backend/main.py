from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

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
    return {"message": "Ordonnancement API"}

@app.get("/tasks")
def get_tasks():
    return tasks

@app.post("/tasks")
def create_task(task: Task):

    # éviter doublons ID
    for t in tasks:
        if t.id == task.id:
            return {"error": "ID déjà existant"}

    tasks.append(task)
    return {"message": "Tâche ajoutée", "task": task}

# CALCUL DATE AU PLUS TOT
@app.get("/schedule/earliest")
def calculate_earliest_dates():

    # répéter pour stabiliser les calculs
    for _ in range(len(tasks)):

        for task in tasks:

            if len(task.dependances) == 0:
                task.date_plus_tot = 0
            else:
                max_date = 0

                for dep in task.dependances:
                    parent = next((t for t in tasks if t.id == dep), None)

                    if parent:
                        finish = parent.date_plus_tot + parent.duree
                        if finish > max_date:
                            max_date = finish

                task.date_plus_tot = max_date

    return tasks


# CALCUL DATE AU PLUS TARD
@app.get("/schedule/latest")
def calculate_latest_dates():

    project_duration = 0
    for task in tasks:
        finish = task.date_plus_tot + task.duree
        if finish > project_duration:
            project_duration = finish

    for task in tasks:
        task.date_plus_tard = project_duration - task.duree

    for task in reversed(tasks):
        for dep in task.dependances:
            for t in tasks:
                if t.id == dep:
                    latest = task.date_plus_tard - t.duree
                    if latest < t.date_plus_tard:
                        t.date_plus_tard = latest

    return tasks


# CALCUL DES MARGES
@app.get("/schedule/margins")
def calculate_margins():

    for task in tasks:
        task.marge = task.date_plus_tard - task.date_plus_tot

    return tasks


# CHEMIN CRITIQUE
@app.get("/schedule/critical-path")
def critical_path():

    critical_tasks = []

    for task in tasks:
        if task.marge == 0:
            critical_tasks.append(task.nom)

    return {"critical_path": critical_tasks}