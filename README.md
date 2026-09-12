<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />



# [LockCalc] 🎯


## Basic Details
### Team Name: [TEAM MURUGA]


### Team Members
- Team Lead: [Vishnu KK] - [College of engineering trikkaripur]
- Member 2: [Adhwaid Krishnan] - [College of engineering trikkaripur]

### Project Description
[**LockCalc** is a calculator with a ridiculous twist: the result is calculated normally but kept hidden behind a lock.
The answer to the calculation becomes the password. Users have to solve the calculation themselves to unlock and reveal the result.
**Calculate → Lock → Solve → Unlock → Reveal**]

### The Problem (that doesn't exist)
[People have become too dependent on calculators to do even the simplest calculations.
The completely unnecessary problem we are solving is:
**"What if a calculator refused to tell you the answer until you proved that you already knew it?"** 💀]

### The Solution (that nobody asked for)
[We made **LockCalc**.
Instead of immediately showing the result, LockCalc hides it and asks the user to enter the answer as a password.
For example:
```text
25 × 4
   ↓
🔒 RESULT LOCKED
Hint:
What is 25 × 4?
Password:
[ 100 ]
 ↓
🔓 RESULT REVEALED
[100]

## Technical Details
### Technologies/Components Used
For Software:
Languages: JavaScript, HTML, CSS
Framework: React
Build Tool: Vite
Styling: Tailwind CSS
Icons: Lucide React
Audio: Web Audio API
Version Control: Git & GitHub
Development Tool: Visual Studio Code
For Hardware:
No hardware components are required.
LockCalc is a completely software-based project.

### Implementation
For Software

LockCalc contains a custom calculation engine that evaluates mathematical expressions and stores the calculated result internally.

The result is not displayed immediately.

Instead:

User enters a mathematical expression.
User presses =.
LockCalc calculates the result internally.
The result is stored as the unlock password.
The display changes to a locked state.
The user solves the original calculation.
The user enters the answer.
LockCalc compares the entered answer with the stored result.
If correct, the result is revealed.
If incorrect, an error state is displayed and the user can try again.
Installation

Clone the repository:

git clone https://github.com/Vishnukk10/LockCalc.git

Move into the project directory:

cd LockCalc

Install dependencies:

npm install
Run

Start the development server:

npm run dev

Open the local URL shown in the terminal.

# Screenshots (Add at least 3)
![<img width="1631" height="1137" alt="Screenshot 2026-09-12 050227" src="https://github.com/user-attachments/assets/fcec292e-f3aa-49c3-91c3-1a4b43840d91" />
)
*Add caption explaining what this shows*

!<img width="1736" height="1132" alt="Screenshot 2026-09-12 050320" src="https://github.com/user-attachments/assets/24a2256b-c982-456c-bfcb-84871a7212fa" />
Add caption explaining what this shows*

!<img width="1782" height="1140" alt="Screenshot 2026-09-12 050354" src="https://github.com/user-attachments/assets/94aef0d5-757e-4a26-976c-6710c7751009" />

*Add caption explaining what this shows*

# Diagrams
┌──────────────────┐
│ Enter Expression │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Calculate Result │
└────────┬─────────┘
         ↓
┌──────────────────┐
│   Lock Result 🔒 │
└────────┬─────────┘
         ↓
┌──────────────────┐
│  Solve Problem   │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Enter Answer     │
└────────┬─────────┘
         ↓
     ┌───┴───┐
     ↓       ↓
  Correct   Wrong
     ↓       ↓
 Unlock 🔓  Retry
     ↓
 Reveal Result

### Project Demo
# Video
[(https://drive.google.com/file/d/1_qURISCw9Z2vgH3YztP28Ntb-oDXRomR/view?usp=drive_link)]
*the video shows evey think u need *

# Additional Demos
[Add any extra demo materials/links]

## Team Contributions
Vishnu KK: Project development, calculator logic, lock/unlock mechanism, UI implementation 
Adhwaid Krishnan: UI/UX contribution, testing, project documentation andGitHub management.

---
Made with ❤️ at TinkerHub Useless Projects 

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)

