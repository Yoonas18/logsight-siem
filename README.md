# LogSight SIEM

LogSight SIEM is a full-stack educational Mini SIEM for cybersecurity academy students. It shows the internal SIEM pipeline from raw CSV logs to parsed events, normalized fields, detection rules, generated alerts, and investigation workflow updates.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, lucide-react
- Backend: Python FastAPI
- Database: SQLite
- Authentication: none for the MVP

## Project Structure

```text
backend/
  app/
    database.py
    detection.py
    main.py
  requirements.txt
frontend/
  public/sample_security_logs.csv
  src/
    components/
    pages/
    services/
sample_security_logs.csv
README.md
```

## Setup

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The backend runs at `http://localhost:8000`.

Health check:

```bash
curl http://localhost:8000/api/health
```

### Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

If the API runs somewhere else, create `frontend/.env`:

```text
VITE_API_BASE_URL=http://localhost:8000
```

## CSV Format

The CSV header must be:

```csv
timestamp,event_id,user,src_ip,dst_ip,action,status,file,role,user_agent
```

Use `sample_security_logs.csv` from the project root or the Upload page download link. The sample contains normal activity and suspicious activity that triggers all six built-in rules.

## API Endpoints

- `GET /api/health`
- `GET /api/rules`
- `POST /api/upload`
- `POST /api/analyze/{upload_id}`
- `GET /api/events`
- `GET /api/alerts`
- `GET /api/alerts/{alert_id}`
- `PATCH /api/alerts/{alert_id}/status`
- `GET /api/dashboard`

## Detection Rules

### R001 - Failed Login Detection

- Condition: `action == "login" and status == "failed"`
- Severity: Low
- Reason: Login attempt failed for this user.
- Recommended action: Check whether the failure is expected. Review recent failed attempts from the same user and source IP.

### R002 - Multiple Failed Login Attempts

- Condition: Same user has 5 or more failed login attempts in the uploaded dataset.
- Severity: High
- Reason: User has multiple failed login attempts, possible brute-force activity.
- Recommended action: Check source IP, account lockout status, and whether login later succeeded.

### R003 - Off-Hours Login

- Condition: `action == "login" and status == "success"` and login hour is before 06:00 or after/equal 22:00.
- Severity: Medium
- Reason: Successful login occurred outside normal business hours.
- Recommended action: Verify if the user was expected to work during this time and review post-login activity.

### R004 - Restricted File Access

- Condition: `action == "file_access" and status == "success" and role != "admin"` and file path contains `admin`, `payroll`, `finance`, `backup`, or `secret`.
- Severity: High
- Reason: Non-admin user accessed a sensitive file path.
- Recommended action: Review whether the user has a valid business reason. Check file permissions and related access activity.

### R005 - Admin Login from Unknown IP

- Condition: `action == "login" and status == "success" and role == "admin"` and source IP is not one of `192.168.1.10`, `192.168.1.11`, or `10.0.0.10`.
- Severity: High
- Reason: Admin account logged in from an unknown source IP.
- Recommended action: Verify the admin login with the account owner. Review geolocation, VPN usage, and privileged activity after login.

### R006 - Suspicious User Agent

- Condition: `user_agent` contains `curl`, `python-requests`, `nmap`, `sqlmap`, `nikto`, or `powershell`.
- Severity: Medium
- Reason: User agent contains a known automation or security testing tool string.
- Recommended action: Check whether this was an approved scanner or unauthorized automation.

## Student Lab Instructions

1. Start the backend and frontend.
2. Open the Upload page.
3. Upload `sample_security_logs.csv`.
4. Click Analyze upload.
5. Open the Dashboard and record total logs, total alerts, and severity counts.
6. Open the Alerts page and filter by High severity.
7. Choose one alert and inspect the original event details.
8. Answer the investigation questions on the Alert Details page.
9. Change the alert status to `investigating`, then close it as true positive or false positive.
10. Edit the sample CSV by adding a new suspicious event, upload it again, and compare the dashboard results.

## Teaching Notes

- Uploading parses and normalizes the CSV into the `events` table.
- Analyzing runs rule logic from `backend/app/detection.py` and inserts matches into the `alerts` table.
- Re-analyzing the same upload replaces existing alerts for that upload, so duplicate alerts are not created.
- Alert status values are `new`, `investigating`, `closed_true_positive`, and `closed_false_positive`.
