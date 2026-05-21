INVENTORY MANAGEMENT PROJECT
============================

This project helps prepare daily marketplace order reports, track return
inventory, view daily report rows, and show sales analytics for uploaded
platform reports.


PROJECT PARTS
-------------

1. Backend
   - FastAPI server
   - SQLite database
   - Excel and CSV processing

2. Frontend
   - React + Vite web app

3. One-click launcher
   - start_project.bat
   - Starts backend and frontend in separate command windows


REQUIREMENTS FOR A NEW WINDOWS PC
---------------------------------

Install these first:

1. Python 3.11
   - During Python install, enable "Add Python to PATH".

2. Node.js
   - Install an LTS version.
   - npm is installed with Node.js.

3. Project folder
   - Copy this whole project folder to the new PC.


FIRST-TIME BACKEND SETUP
------------------------

Open Command Prompt in the project folder.

Run:

cd backend
python -m venv venv
venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

The backend requirements are stored in:

backend\requirements.txt


FIRST-TIME FRONTEND SETUP
-------------------------

Open Command Prompt in the project folder.

Run:

cd frontend
npm install

The frontend packages are defined in:

frontend\package.json


START THE PROJECT
-----------------

Recommended Windows start:

1. Double-click:

start_project.bat

2. Keep both command windows open while using the app.

3. Open the frontend in the browser:

http://localhost:5173

Backend API runs at:

http://127.0.0.1:8000


MANUAL START COMMANDS
---------------------

Backend:

cd backend
venv\Scripts\activate
uvicorn app.main:app --reload

Frontend:

cd frontend
npm run dev


IMPORTANT NOTES
---------------

1. Do not close the backend or frontend command window while using the app.

2. The backend uses a local SQLite database file:

backend\inventory.db

3. Uploaded and generated files are stored inside backend folders such as:

backend\uploads
backend\outputs

4. If the backend does not start on a new PC:
   - Confirm Python 3.11 is installed.
   - Recreate backend\venv.
   - Install backend requirements again.

5. If the frontend does not start on a new PC:
   - Confirm Node.js and npm are installed.
   - Run npm install inside frontend again.


QUICK NEW-PC CHECKLIST
----------------------

1. Install Python 3.11.
2. Install Node.js.
3. Copy the project folder.
4. Create backend virtual environment.
5. Install backend requirements.
6. Run npm install inside frontend.
7. Double-click start_project.bat.
