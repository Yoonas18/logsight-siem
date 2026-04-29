# LogSight SIEM

LogSight SIEM is a full-stack educational Mini SIEM for cybersecurity academy students. It shows the internal SIEM pipeline from raw CSV logs to parsed events, normalized fields, detection rules, generated alerts, and investigation workflow updates.

The next-level version also includes role-based access control and a CSV schema mapper so students can import non-LogSight CSV files from local files or public URLs and normalize them into the SIEM event model.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, lucide-react
- Backend: Python FastAPI
- Database: SQLite
- Access control: local demo users with admin, analyst, and student roles

## Project Structure

```text
backend/
  app/
    auth.py
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

## Demo Access Control

The app seeds three local training users on backend startup:

| Username | Password | Role | Permissions |
| --- | --- | --- | --- |
| `admin` | `LogSightAdmin123!` | Administrator | Upload/import logs, run detections, update alert status, view all pages |
| `analyst` | `Analyst123!` | SOC Analyst | Upload/import logs, run detections, update alert status, view all pages |
| `student` | `Student123!` | Student Viewer | View dashboard, alerts, rules, and evidence without changing data |

These users are intended for a local educational lab. Change or remove them before adapting this project for any public deployment.

## CSV Format

The native LogSight CSV header is:

```csv
timestamp,event_id,user,src_ip,dst_ip,action,status,file,role,user_agent
```

Use `sample_security_logs.csv` from the project root or the Upload page download link. The sample contains normal activity and suspicious activity that triggers all six built-in rules.

## Importing Other CSV Files

LogSight can now import:

- Local CSV files from your computer
- Public raw CSV URLs
- GitHub `blob` CSV links, which are converted to raw links automatically
- Google Drive direct file links when the file is publicly accessible

If the CSV does not use the native LogSight columns, the Upload page shows a schema mapper. Map source columns into normalized fields such as `timestamp`, `user`, `src_ip`, `action`, `status`, `file`, `role`, and `user_agent`.

Unmapped fields receive safe defaults, but detections work best when the dataset contains fields that can be mapped to the rule logic. For example, a web server CSV with only `ip`, `method`, `url`, and `status_code` can be stored and normalized, but login-specific detections will only fire if the mapped fields contain login-style values.

## API Endpoints

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/rules`
- `POST /api/upload`
- `POST /api/preview-url`
- `POST /api/import-url`
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
2. Sign in as `analyst` using `Analyst123!`.
3. Open the Upload page.
4. Upload `sample_security_logs.csv`.
5. Click Analyze upload.
6. Open the Dashboard and record total logs, total alerts, and severity counts.
7. Open the Alerts page and filter by High severity.
8. Choose one alert and inspect the original event details.
9. Answer the investigation questions on the Alert Details page.
10. Change the alert status to `investigating`, then close it as true positive or false positive.
11. Sign out and sign in as `student` using `Student123!`.
12. Confirm the student can view evidence but cannot upload logs or change alert status.
13. Try a public CSV from GitHub or another source, preview its columns, map the fields, import it, and compare the dashboard results.

## Teaching Notes

- Uploading parses and normalizes the CSV into the `events` table.
- Non-native CSV files can be normalized through the schema mapper before storage.
- Analyzing runs rule logic from `backend/app/detection.py` and inserts matches into the `alerts` table.
- Re-analyzing the same upload replaces existing alerts for that upload, so duplicate alerts are not created.
- Alert status values are `new`, `investigating`, `closed_true_positive`, and `closed_false_positive`.
- Access control is intentionally simple and local so students can read the code and understand role checks.
