# SMART EXAMINATION SEAT ALLOTMENT AND INVIGILATOR ASSIGNMENT SYSTEM

A web-based examination management system designed to automate examination seating arrangements, faculty invigilator assignments, and examination administration.

The system aims to reduce manual workload, minimize allocation conflicts, improve accuracy, and simplify examination management through a centralized platform.

---

## Features

### 1. Role-Based Access

- Admin Dashboard
- HOD Dashboard
- Faculty / Invigilator Dashboard
- Student Portal
- Authentication and role-based access control

### 2. Student Management

- Student data management
- Excel-based student data import
- Academic year, study year, semester, and section-based organization
- Student seat lookup using hall ticket number

### 3. Faculty Management

- Faculty directory management
- Excel-based faculty data import
- Semester-wise subject and faculty mapping
- Faculty invigilation assignment management

### 4. Examination Management

- Examination scheduling
- Examination type and subject selection
- Examination history
- Examination status management

### 5. Automated Seating Allocation

- Automated student seat allocation
- Hall selection based on capacity
- Section-based seating constraints
- Seating chart generation
- Supplementary student allocation

### 6. Invigilator Management

- Automated invigilator assignment
- Faculty-subject conflict restrictions
- Invigilator workload balancing
- Assignment decline and reassignment workflow

### 7. Conflict Detection

- Seating adjacency conflict detection
- Faculty availability checks
- Invigilator scheduling conflict detection

### 8. Reports and Analytics

- Room-wise seating arrangement reports
- Student attendance sheets
- Faculty invigilation duty reports
- Examination analytics

---

## Technology Stack

| Component         | Technology     |
| ----------------- | -------------- |
| Frontend          | React.js       |
| Build Tool        | Vite           |
| Styling           | CSS            |
| Backend           | Python Flask   |
| Database          | MySQL          |
| API Communication | REST API       |
| Data Import       | Excel / CSV    |
| Version Control   | Git and GitHub |

---

## Project Structure

```text
SmartExamSystem/
│
├── backend/
│   ├── app.py
│   ├── config.py
│   ├── db.py
│   ├── admin_routes.py
│   ├── auth_routes.py
│   ├── file_parser.py
│   ├── report_generator.py
│   └── requirements.txt
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   └── services/
│   ├── package.json
│   └── vite.config.js
│
├── data/
├── .gitignore
└── README.md
```

---

## Installation and Setup

### Prerequisites

Install the following before running the project:

- Python 3.x
- Node.js and npm
- MySQL Server
- MySQL Workbench (recommended)
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/Manvithayadla/exam-seat-allocation-system.git
cd exam-seat-allocation-system
```

### 2. Backend Setup

```bash
cd backend
```

Create and activate a virtual environment:

```bash
python -m venv venv
```

Windows:

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Configure your MySQL database connection using the project's configuration files and your local environment settings.

Run the Flask application using the appropriate entry point configured in the project.

### 3. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite in your browser.

---

## Database

The application uses MySQL for storing examination-related information, including:

- Student records
- Faculty records
- Subject information
- Examination schedules
- Examination halls
- Seating allocations
- Invigilator assignments

Configure the database connection according to your local MySQL setup.

---

## Security

- Role-based access control
- Password hashing
- Authentication and authorization
- Environment-based configuration for sensitive credentials

Never commit database passwords, secret keys, private Excel files, or institutional records to a public repository.

---

## Project Purpose

The Smart Exam System is developed as an academic project to demonstrate how web technologies, database management, and automated allocation algorithms can be applied to streamline examination administration.

---

## Repository

GitHub: [https://github.com/Manvithayadla/exam-seat-allocation-system](https://github.com/Manvithayadla/exam-seat-allocation-system)

**Project:** Smart Exam System
**Domain:** Web Development | Database Management | Examination Automation
