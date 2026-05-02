"""
High School Management System API

A super simple FastAPI application that allows students to view and sign up
for extracurricular activities at Mergington High School.
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import json
import secrets
from pathlib import Path
from passlib.hash import bcrypt

app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")

# Mount the static files directory
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(Path(__file__).parent,
          "static")), name="static")

# --- Auth setup ---

TEACHERS_FILE = current_dir / "teachers.json"

# In-memory session store: token -> username
_sessions: dict[str, str] = {}


def _load_and_migrate_teachers() -> dict:
    """Load teachers.json, hashing any plain-text passwords on first run."""
    with open(TEACHERS_FILE, "r") as f:
        data = json.load(f)

    changed = False
    for teacher in data["teachers"]:
        if teacher["password"].startswith("plain:"):
            plain = teacher["password"][len("plain:"):]
            teacher["password"] = bcrypt.hash(plain)
            changed = True

    if changed:
        with open(TEACHERS_FILE, "w") as f:
            json.dump(data, f, indent=2)

    return {t["username"]: t["password"] for t in data["teachers"]}


_teachers: dict[str, str] = _load_and_migrate_teachers()

security = HTTPBearer(auto_error=False)


def get_current_teacher(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str | None:
    """Return the logged-in teacher's username, or None if not authenticated."""
    if credentials is None:
        return None
    return _sessions.get(credentials.credentials)


def require_teacher(
    teacher: str | None = Depends(get_current_teacher),
) -> str:
    """Dependency that raises 401 if the request is not from an authenticated teacher."""
    if teacher is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return teacher


# --- Auth endpoints ---

@app.post("/auth/login")
def login(username: str, password: str):
    """Log in as a teacher. Returns a session token."""
    hashed = _teachers.get(username)
    if hashed is None or not bcrypt.verify(password, hashed):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = secrets.token_urlsafe(32)
    _sessions[token] = username
    return {"token": token, "username": username}


@app.post("/auth/logout")
def logout(teacher: str = Depends(require_teacher),
           credentials: HTTPAuthorizationCredentials | None = Depends(security)):
    """Log out the current teacher session."""
    if credentials:
        _sessions.pop(credentials.credentials, None)
    return {"message": f"Logged out {teacher}"}


@app.get("/auth/status")
def auth_status(teacher: str | None = Depends(get_current_teacher)):
    """Return the current auth status."""
    return {"logged_in": teacher is not None, "username": teacher}


# --- Activity data ---

# In-memory activity database
activities = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["michael@mergington.edu", "daniel@mergington.edu"]
    },
    "Programming Class": {
        "description": "Learn programming fundamentals and build software projects",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": ["emma@mergington.edu", "sophia@mergington.edu"]
    },
    "Gym Class": {
        "description": "Physical education and sports activities",
        "schedule": "Mondays, Wednesdays, Fridays, 2:00 PM - 3:00 PM",
        "max_participants": 30,
        "participants": ["john@mergington.edu", "olivia@mergington.edu"]
    },
    "Soccer Team": {
        "description": "Join the school soccer team and compete in matches",
        "schedule": "Tuesdays and Thursdays, 4:00 PM - 5:30 PM",
        "max_participants": 22,
        "participants": ["liam@mergington.edu", "noah@mergington.edu"]
    },
    "Basketball Team": {
        "description": "Practice and play basketball with the school team",
        "schedule": "Wednesdays and Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["ava@mergington.edu", "mia@mergington.edu"]
    },
    "Art Club": {
        "description": "Explore your creativity through painting and drawing",
        "schedule": "Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["amelia@mergington.edu", "harper@mergington.edu"]
    },
    "Drama Club": {
        "description": "Act, direct, and produce plays and performances",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
        "max_participants": 20,
        "participants": ["ella@mergington.edu", "scarlett@mergington.edu"]
    },
    "Math Club": {
        "description": "Solve challenging problems and participate in math competitions",
        "schedule": "Tuesdays, 3:30 PM - 4:30 PM",
        "max_participants": 10,
        "participants": ["james@mergington.edu", "benjamin@mergington.edu"]
    },
    "Debate Team": {
        "description": "Develop public speaking and argumentation skills",
        "schedule": "Fridays, 4:00 PM - 5:30 PM",
        "max_participants": 12,
        "participants": ["charlotte@mergington.edu", "henry@mergington.edu"]
    }
}


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/activities")
def get_activities():
    return activities


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(activity_name: str, email: str,
                        teacher: str = Depends(require_teacher)):
    """Sign up a student for an activity (teachers only)"""
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    activity = activities[activity_name]

    if email in activity["participants"]:
        raise HTTPException(status_code=400, detail="Student is already signed up")

    if len(activity["participants"]) >= activity["max_participants"]:
        raise HTTPException(status_code=400, detail="Activity is full")

    activity["participants"].append(email)
    return {"message": f"Signed up {email} for {activity_name}"}


@app.delete("/activities/{activity_name}/unregister")
def unregister_from_activity(activity_name: str, email: str,
                             teacher: str = Depends(require_teacher)):
    """Unregister a student from an activity (teachers only)"""
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    activity = activities[activity_name]

    if email not in activity["participants"]:
        raise HTTPException(status_code=400, detail="Student is not signed up for this activity")

    activity["participants"].remove(email)
    return {"message": f"Unregistered {email} from {activity_name}"}
