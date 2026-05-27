# Intelligent Automation System

**Status:** Design Complete - Ready for Implementation  
**Date:** May 27, 2026  
**Design Philosophy:** Minimalist, Intelligent, Safe, Transparent, Collaborative

---

## Overview

A redesign of permission modes to make agent behavior both more powerful and more transparent. Instead of simple permission gates, the system introduces a unified **Human-in-the-Loop control** that governs how often the agent engages the user in collaborative decision-making.

### Core Insight

**Transparency and Autonomy are separate concerns:**

```
Transparency: CONSTANT (always 100%)
  → Always show planning phases
  → Always show execution progress
  → Always explain reasoning
  → Never hide what's happening

Autonomy: VARIABLE (slider 0-100%)
  → How often agent pauses to engage human
  → Includes decisions, preferences, feedback, approval
  → Low autonomy = frequent collaboration
  → High autonomy = independent decision-making
```

### Core Principles

1. **Always Transparent** - User always sees planning and execution, regardless of trust level
2. **Minimalist** - Two modes, one continuous slider
3. **Intelligent** - LLM assesses risk, complexity, and when to engage human
4. **Safe** - Hard limits protect against catastrophic errors
5. **Collaborative** - Slider controls engagement, not just approval
6. **Flexible** - Adjustable anytime, mid-conversation

---

## Final Design

### Two Modes

#### **Plan Mode**
```yaml
Purpose: Read-only exploration and research
Permission: Read-only (no file modifications, no execution)
When to use: 
  - Pure exploration without execution risk
  - Learning/understanding unfamiliar code
  - Want detailed analysis with zero execution
  - Export plan for later execution

Behavior:
  - Shows visible planning phases
  - Structured exploration workflow
  - Presents detailed plan
  - NEVER executes (even on approval)
  - Can export plan or switch to Auto mode
```

**Key distinction:** Plan mode guarantees **zero execution risk**. Pure research mode.

---

#### **Auto Mode** (Default)
```yaml
Purpose: Intelligent execution with configurable autonomy
Permission: Adaptive based on autonomy level (slider)
When to use:
  - Normal work (90% of time)
  - Execution with configurable human involvement
  - Flexible control over collaboration

Behavior:
  - ALWAYS shows planning phases (transparent)
  - ALWAYS shows execution progress (transparent)
  - Pauses for human engagement based on slider:
    * Low autonomy: Frequent collaboration
    * High autonomy: Independent decisions
```

**Key distinction:** Auto mode **can execute** and adapts how often it engages you, but **always remains visible**.

---

## The Human-in-the-Loop Slider

**Continuous 0-100% slider** (only visible in Auto mode)

```
┌──────────────────────────────────────────┐
│ Mode: [Plan] [Auto]                      │
│                                          │
│ When Auto mode:                          │
│ Autonomy Level: [───o────] 50%          │
│                 Collaborative → Independent
│                                          │
│ Controls how often agent engages you:    │
│ • Decisions (which approach?)            │
│ • Preferences (X or Y?)                  │
│ • Validation (does this look right?)     │
│ • Feedback (how to improve?)             │
│ • Guidance (optimize for what?)          │
│ • Approval (can I proceed?)              │
│ • Trade-offs (fast vs safe?)             │
│                                          │
│ Planning & execution always visible      │
└──────────────────────────────────────────┘
```

---

## What the Slider Controls

### Human-in-the-Loop Engagement Types

The slider controls **frequency of ALL human involvement**, not just approvals:

#### 1. **Decision-Making**
```
Low autonomy:   "I found 3 approaches. Which should I use?"
High autonomy:  "Analyzing approaches... JWT chosen (best fit)"
```

#### 2. **Preferences**
```
Low autonomy:   "Put middleware in src/auth/ or src/middleware/auth/?"
High autonomy:  "Creating middleware in src/auth/ (follows conventions)"
```

#### 3. **Validation**
```
Low autonomy:   "Here's my plan. Does it make sense?"
High autonomy:  "Plan complete. Proceeding..."
```

#### 4. **Feedback**
```
Low autonomy:   "Task 1 done. How does it look? Any changes?"
High autonomy:  "Task 1 complete. Continuing..."
```

#### 5. **Guidance**
```
Low autonomy:   "Optimize for readability or performance?"
High autonomy:  "Optimizing for readability (maintainability priority)"
```

#### 6. **Approval**
```
Low autonomy:   "Can I create these 8 files?"
High autonomy:  "Creating 8 files..."
```

#### 7. **Clarification**
```
Low autonomy:   "By 'authentication' do you mean login only or full RBAC?"
High autonomy:  "Implementing standard login/logout (common case)"
```

#### 8. **Trade-offs**
```
Low autonomy:   "Fast implementation (skip tests) or thorough (with tests)?"
High autonomy:  "Implementing with tests (quality-first approach)"
```

---

## Transparency: Always Constant

**Regardless of autonomy level, user ALWAYS sees:**

### Planning Phase (Always Visible)
```
📋 Phase 1: Exploring codebase
  ✓ Found existing auth patterns
  ✓ Identified 8 entry points
  ✓ Checked dependencies

📋 Phase 2: Analyzing requirements
  ✓ Session management needed
  ✓ JWT approach recommended
  ✓ Security considerations reviewed

📋 Phase 3: Designing solution
  ✓ Middleware-based approach
  ✓ Route protection strategy
  ✓ Test coverage plan
```

### Plan Presentation (Always Visible)
```
Proposed Plan:
1. Create auth middleware
2. Add login/logout routes
3. Protect existing routes
4. Add tests

Files: 12 new, 8 modified
Dependencies: @auth/core, bcrypt
```

### Execution Progress (Always Visible)
```
🔨 Task 1: Create auth middleware
  ✓ Created src/auth/middleware.ts
  ✓ Implemented JWT validation
  
🔨 Task 2: Add login/logout routes
  ✓ Created src/api/auth/login.ts
  ✓ Created src/api/auth/logout.ts
  
🔨 Task 3: Protect routes
  ✓ Updated 8 files
  
🔨 Task 4: Add tests
  ✓ Added tests
  
Done!
```

**The difference is not WHAT you see, but HOW OFTEN you're asked to participate.**

---

## Auto Mode Behavior by Autonomy Level

### Low Autonomy (0-30%): Highly Collaborative

**Task: "Add authentication"**

```
Agent:
  📋 Phase 1: Exploring codebase
    ✓ Found existing patterns
    ✓ Identified entry points
  
  ⏸️ I found 3 authentication approaches:
     1. JWT tokens (stateless, scalable)
     2. Session cookies (simpler, server state)
     3. OAuth (third-party, complex)
     
     Which approach fits your needs?
     [JWT] [Sessions] [OAuth] [Tell me more]

User: JWT

Agent:
  📋 Phase 2: Analyzing requirements
    ✓ JWT approach confirmed
    ✓ Token refresh strategy needed
    
  ⏸️ Should I implement token refresh?
     - With refresh: More secure, complex
     - Without: Simpler, re-login on expiry
     
     [With refresh] [Without] [Explain trade-offs]

User: With refresh

Agent:
  📋 Phase 3: Designing solution
    ✓ Middleware-based approach
    ✓ Refresh token rotation
    
  ⏸️ Directory structure preference?
     1. src/auth/ (flat, simple)
     2. src/middleware/auth/ (organized)
     
     [Option 1] [Option 2] [Your choice]

User: Option 1

Agent:
  Proposed Plan:
  1. Create auth middleware
  2. Add login/logout/refresh routes
  3. Protect existing routes
  4. Add tests
  
  Files: 15 new, 8 modified
  
  ⏸️ Does this plan look good?
     [Yes, proceed] [Let me adjust] [Cancel]

User: Yes, proceed

Agent:
  🔨 Task 1: Create auth middleware
    Creating src/auth/middleware.ts...
    
  ⏸️ Should I continue?
     [Yes] [Show me the file first] [Cancel]

User: Yes

Agent:
  ✓ Created middleware
  
  🔨 Task 2: Add auth routes
    Creating src/api/auth/login.ts...
    
  ⏸️ Proceed with this file?
     [Yes] [Skip] [Cancel all]

(Continues with frequent checkpoints)
```

**Experience:**
- Frequent questions about approach
- Asks for preferences on structure
- Validates plan before executing
- Confirms each task
- Collaborative decision-making throughout

---

### Mid Autonomy (40-60%): Balanced Collaboration

**Task: "Add authentication"**

```
Agent:
  📋 Phase 1: Exploring codebase
    ✓ Found existing patterns
    ✓ Identified entry points
  
  📋 Phase 2: Analyzing requirements
    ✓ JWT approach recommended (stateless)
    ✓ Token refresh for security
    
  ⏸️ I recommend JWT with refresh tokens.
     This provides security with good UX.
     
     [Sounds good] [I prefer sessions] [Tell me more]

User: Sounds good

Agent:
  📋 Phase 3: Designing solution
    ✓ Middleware-based approach
    ✓ Following project conventions (src/auth/)
    
  Proposed Plan:
  1. Create auth middleware
  2. Add login/logout/refresh routes
  3. Protect existing routes
  4. Add tests
  
  Files: 15 new, 8 modified
  Dependencies: @auth/core, bcrypt, jsonwebtoken
  
  ⏸️ Approve this plan?
     [Yes] [Edit] [No]

User: Yes

Agent:
  🔨 Task 1: Create auth middleware
    ✓ Created src/auth/middleware.ts
    ✓ Implemented JWT validation
    
  🔨 Task 2: Add auth routes
    ✓ Created src/api/auth/login.ts
    ✓ Created src/api/auth/logout.ts
    ✓ Created src/api/auth/refresh.ts
    
  🔨 Task 3: Protect routes
    ⚠️ Need to modify package.json (risk: 65%)
    
  ⏸️ Allow package.json modification?
     Reason: Add JWT dependencies
     [Allow] [Deny]

User: Allow

Agent:
  ✓ Updated package.json
  ✓ Protected 8 routes
  
  🔨 Task 4: Add tests
    ✓ Added auth tests
    
  Done!
```

**Experience:**
- Agent recommends approach (with option to override)
- Makes structure decisions following conventions
- One plan approval
- Auto-executes safe operations
- Asks for risky operations only
- Balanced collaboration

---

### High Autonomy (70-90%): Minimal Collaboration

**Task: "Add authentication"**

```
Agent:
  📋 Phase 1: Exploring codebase
    ✓ Found existing patterns
    ✓ Identified entry points
  
  📋 Phase 2: Analyzing requirements
    ✓ JWT approach selected (best for architecture)
    ✓ Token refresh for security
  
  📋 Phase 3: Designing solution
    ✓ Middleware approach
    ✓ Following src/auth/ convention
    
  Proposed Plan:
  1. Create auth middleware
  2. Add login/logout/refresh routes
  3. Protect existing routes
  4. Add tests
  
  Files: 15 new, 8 modified
  Dependencies: @auth/core, bcrypt, jsonwebtoken
  
  Starting execution...

Agent:
  🔨 Task 1: Create auth middleware
    ✓ Created src/auth/middleware.ts
    
  🔨 Task 2: Add auth routes
    ✓ Created src/api/auth/login.ts
    ✓ Created src/api/auth/logout.ts
    ✓ Created src/api/auth/refresh.ts
    
  🔨 Task 3: Protect routes
    ✓ Modified package.json (auto-approved)
    ✓ Protected 8 routes
    
  🔨 Task 4: Add tests
    ✓ Added tests
    
  Done!
```

**Experience:**
- Agent makes all architectural decisions
- No approval needed for plan
- Auto-executes everything
- Only stops for truly catastrophic operations
- User watches but doesn't participate
- Independent decision-making

---

### Very High Autonomy (90-100%): Maximum Independence

**Task: "Add authentication"**

```
Agent:
  📋 Phase 1: Exploring ✓
  📋 Phase 2: Analyzing ✓
  📋 Phase 3: Designing ✓
  
  Executing plan...
  
  🔨 Task 1: Auth middleware ✓
  🔨 Task 2: Auth routes ✓
  🔨 Task 3: Route protection ✓
  🔨 Task 4: Tests ✓
  
  Done! Added JWT authentication with refresh tokens.
  Modified: 15 files
```

**Experience:**
- Condensed progress view
- No questions, no approvals
- Full autonomy
- User observes results
- Only truly catastrophic ops would pause (rm -rf /)

**Note:** Still transparent! User sees phases and tasks, just not asked to participate.

---

## Technical Architecture

### Hybrid Risk Assessment

**Two-layer system combining LLM intelligence with deterministic safety:**

#### Layer 1: Hard Limits (Safety Net)
```typescript
// Deterministic minimum risk scores
// Cannot be overridden by LLM assessment

Examples:
- "rm -rf" commands: minimum 95% risk
- "sudo" commands: minimum 90% risk
- Git push to main/master: minimum 85% risk
- .env file edits: minimum 85% risk
- package.json edits: minimum 60% risk
- Delete operations: minimum 70% risk
```

#### Layer 2: LLM Assessment (Intelligence)
```typescript
// Agent evaluates multiple factors:

1. Operation Risk
   - File type and location
   - Command danger
   - Reversibility
   
2. Decision Complexity
   - Multiple valid approaches?
   - Trade-offs involved?
   - Domain expertise required?
   
3. Preference Dependency
   - Subjective choices (naming, structure)
   - Style preferences
   - Optimization priorities
   
4. Validation Needs
   - Requirements unclear?
   - Assumptions made?
   - Edge cases uncertain?
```

---

## LLM Assessment Methodology

**CRITICAL SYSTEM COMPONENT**

The accuracy of the entire system depends on the LLM's ability to assess operations across multiple dimensions. This section defines comprehensive rubrics, tooling, and calibration processes.

### Why Assessment Quality Matters

**Trust depends on it:**
- Accurate scoring → appropriate engagement → user confidence
- Inaccurate scoring → annoying prompts OR missed risks → system failure

**Safety depends on it:**
- Under-scoring = catastrophic operations slip through
- Over-scoring = trust erosion from unnecessary prompts

**UX depends on it:**
- Right balance of autonomy and collaboration
- User feels system "gets it"

---

### Assessment Approach: Hybrid LLM + Backend Validation

**Token-Efficient Three-Layer System:**

1. **System Prompt** - Lightweight principles + few-shot examples (~500-800 tokens)
2. **LLM Assessment** - Reasons through principles, calls AssessOperation tool
3. **Backend Validation** - Comprehensive rubrics in code, validates scores, applies hard limits (0 tokens)

**Key Design Decision: Rubrics Live in Backend, Not Prompt**

❌ **Don't:** Put exhaustive rubrics in system prompt (2,500+ tokens per request)
✅ **Do:** Teach principles via few-shot examples (500-800 tokens), validate in backend

**Token Savings:** 80% reduction while maintaining accuracy

**Example workflow:**
```
Agent: <thinking>
       Need to edit package.json to add bcrypt dependency.
       
       Risk factors:
       - File type: Config file (high)
       - Operation: Modify existing (medium)
       - Reversibility: Git revert available (low)
       - Scope: Root file (high)
       - Impact: Dependency change, can break build (high)
       
       Calculation:
       Base (config): 60
       + Modify: 10
       + Root: 20
       + Reversible: 5
       + Impact: 15
       = 110 → cap at 100... wait, re-evaluate
       
       Actually:
       Base: 60 (package.json)
       + Impact: 15 (dependency)
       = 75... but hard limit is 60 minimum
       Final: max(75, 60) = 75
       
       Complexity: Low (standard operation, 20)
       Subjectivity: None (0)
       </thinking>
       
       [Calls AssessOperation]
       {
         operation: "Add bcrypt dependency to package.json",
         risk_score: 75,
         risk_calculation: "Base 60 + Impact 15 = 75",
         complexity_score: 20,
         requires_approval: true (75 > autonomy_level)
       }
```

**Why this approach:**
- ✅ Reasoning visible (debuggable)
- ✅ Structured output (enforceable)
- ✅ Backend validated (safe)
- ✅ Auditable (logged)
- ✅ Tunable (can refine rubrics)
- ✅ **Token-efficient** (500-800 tokens vs 2,500-3,500)
- ✅ **Easy to update** (change backend code, not prompt)

---

### System Prompt Strategy: Few-Shot Learning

**Instead of exhaustive rubrics, use 5-8 examples + high-level principles:**

```typescript
const assessmentGuidance = `
ASSESSMENT PRINCIPLES:

Risk Guidelines:
  File Sensitivity:
    Critical: .env, .git/*, credentials → 80-90
    Config: package.json, tsconfig → 60-70
    Source: *.ts, *.tsx → 30-40
    Tests: *.test.*, *.spec.* → 10-20
    Docs: *.md → 5-15
  
  Operation Impact:
    Delete → +30 (irreversible)
    Modify → +10 (changing existing)
    Create → +5 (new, low risk)
  
  Commands:
    Destructive: rm -rf, sudo → 90-100
    Stateful: npm install, git push → 40-70
    Safe: git status, ls, grep → 0-10

Complexity Guidelines:
  - Multiple valid approaches → 60-90
  - Standard operation → 10-30
  - Trade-offs involved → 40-70

Subjectivity Guidelines:
  - Style preference → 80-100
  - Technical best practice → 0-20
  - Team conventions → 40-60

FEW-SHOT EXAMPLES:

Example 1: Config File Modification
<thinking>
Operation: Edit package.json to add bcrypt
- File: Config (base: 60)
- Operation: Modify (+10)
- Impact: Dependencies (+5)
= 75
</thinking>
Assessment: risk=75, complexity=20, subjectivity=0
→ Requires approval if autonomy < 75%

Example 2: Source Code Creation
<thinking>
Operation: Create src/auth/middleware.ts
- File: Source (base: 30)
- Operation: Create (+5)
- Feature: Auth (moderate complexity)
= 35 risk, 40 complexity
</thinking>
Assessment: risk=35, complexity=40, subjectivity=10
→ May require decision if autonomy < 32% (40*0.8)

Example 3: Critical File Deletion
<thinking>
Operation: Delete .env file
- File: Critical (base: 85)
- Operation: Delete (+30)
= 115 → cap at 100
</thinking>
Assessment: risk=100, complexity=10, subjectivity=0
→ Always requires approval

Example 4: Dangerous Command
<thinking>
Operation: Run "rm -rf node_modules"
- Command: Destructive (direct: 95)
</thinking>
Assessment: risk=95, complexity=10, subjectivity=0
→ Requires approval if autonomy < 95%

Example 5: Safe Documentation
<thinking>
Operation: Create docs/api.md
- File: Docs (base: 10)
- Operation: Create (+5)
= 15
</thinking>
Assessment: risk=15, complexity=10, subjectivity=5
→ Usually auto-allowed

Example 6: Architectural Decision
<thinking>
User asks: "Which auth approach?"
- Multiple approaches: JWT, Sessions, OAuth (complexity: 90)
- Significant trade-offs (impact: high)
- User context needed (subjectivity: 40)
</thinking>
Assessment: risk=N/A, complexity=90, subjectivity=40
→ Requires decision if autonomy < 72% (90*0.8)

Example 7: Style Preference
<thinking>
Question: "Flat vs nested directories?"
- Subjective choice (subjectivity: 90)
- Low technical impact (complexity: 30)
</thinking>
Assessment: complexity=30, subjectivity=90
→ Requires preference if autonomy < 90%

Example 8: Standard Operation
<thinking>
Operation: Run "npm test"
- Command: Safe (direct: 10)
- Standard practice (complexity: 10)
</thinking>
Assessment: risk=10, complexity=10, subjectivity=0
→ Almost always auto-allowed

Use these patterns to assess similar operations.
Backend will validate your scores and apply safety minimums.
`;

// Total: ~800 tokens (vs 2,500+ for full rubrics)
```

**Benefits:**
- LLM learns patterns from examples
- Principles guide edge cases
- Backend enforces exact rules
- Easy to add examples for common mistakes

---

### Backend Rubrics (Implementation Reference)

**Note:** These comprehensive rubrics live in **backend code**, not the system prompt.
They validate LLM assessments and apply hard limits at zero token cost.

#### Risk Scoring Rubric (0-100)

#### File Type Base Scores

```typescript
FILE_TYPE_RISK = {
  // Critical system files
  '.env': 85,
  '.env.*': 85,
  '.git/*': 90,
  
  // Configuration files
  'package.json': 60,
  'tsconfig.json': 60,
  'webpack.config.js': 60,
  'next.config.js': 60,
  '.eslintrc.*': 50,
  '.prettierrc.*': 50,
  
  // Root-level files
  'Dockerfile': 65,
  'docker-compose.yml': 65,
  '.github/workflows/*': 70,
  
  // Source code
  'src/**/*.ts': 30,
  'src/**/*.tsx': 30,
  'src/**/*.js': 30,
  'src/**/*.jsx': 30,
  
  // Tests
  'test/**/*': 15,
  '**/*.test.ts': 15,
  '**/*.spec.ts': 15,
  
  // Documentation
  '**/*.md': 10,
  'docs/**/*': 10,
  
  // Temporary/generated
  'node_modules/**': 90,  // Deleting is dangerous
  'dist/**': 40,
  'build/**': 40,
};
```

#### Operation Type Modifiers

```typescript
OPERATION_MODIFIERS = {
  delete: +30,      // Irreversible
  modify: +10,      // Changing existing
  create: +5,       // New file (low risk)
};
```

#### Command Risk (Bash)

```typescript
COMMAND_RISK = {
  // Catastrophic
  'rm -rf /': 100,
  'sudo rm -rf': 100,
  
  // Dangerous
  'rm -rf': 95,
  'sudo': 90,
  'git push origin main': 85,
  'git push origin master': 85,
  'npm publish': 80,
  'yarn publish': 80,
  
  // Risky
  'git push': 70,
  'npm install': 40,
  'yarn install': 40,
  
  // Safe
  'git status': 5,
  'git diff': 5,
  'ls': 0,
  'grep': 0,
  'cat': 0,
  'npm test': 10,
};
```

#### Scope Modifiers

```typescript
SCOPE_MODIFIERS = {
  system_wide: +40,        // /usr/, /etc/, /var/
  project_root: +20,       // Files in ./
  nested_1_2_levels: +10,  // ./src/
  deeply_nested: +5,       // ./src/components/ui/
};
```

#### Reversibility Modifiers

```typescript
REVERSIBILITY_MODIFIERS = {
  irreversible: +30,           // rm, npm publish
  hard_to_reverse: +20,        // Database migrations
  git_revertable: +5,          // Most code changes
  easily_undoable: +0,         // Create file
};
```

#### Production Impact Modifiers

```typescript
IMPACT_MODIFIERS = {
  critical_path: +30,          // Auth, payment, core features
  important: +15,              // Secondary features
  development_only: +5,        // Tests, docs
};
```

---

### Risk Calculation Examples

#### Example 1: Edit Source File
```
Operation: Edit src/auth/middleware.ts

Calculation:
  Base (src/ .ts file): 30
  + Modify operation: 10
  + Nested scope: 10
  + Git revertable: 5
  + Important feature: 15
  = 70

Hard limit check: None for src/ files
Final risk: 70

Interpretation:
  - At 50% autonomy: 70 > 50 → Ask approval
  - At 80% autonomy: 70 < 80 → Auto-allowed
```

#### Example 2: Delete Config File
```
Operation: Delete package.json

Calculation:
  Base (package.json): 60
  + Delete operation: 30
  + Root scope: 20
  + Irreversible: 30
  + Critical: 30
  = 170 → cap at 100
  
Hard limit check: package.json = 60, but score already higher
Final risk: 100

Interpretation:
  - At ANY autonomy level: Requires approval
  - Likely user mistake, agent should question intent
```

#### Example 3: Create Documentation
```
Operation: Create docs/api-reference.md

Calculation:
  Base (docs/ .md): 10
  + Create operation: 5
  + Nested scope: 5
  + Easily undoable: 0
  + Dev only: 5
  = 25

Hard limit check: None
Final risk: 25

Interpretation:
  - At 50% autonomy: 25 < 50 → Auto-allowed
  - At 20% autonomy: 25 > 20 → Ask approval
```

#### Example 4: Bash Command
```
Operation: Run 'rm -rf node_modules'

Calculation:
  Command base: 95 (rm -rf pattern)
  (No modifiers for bash commands)
  
Hard limit check: rm -rf = 95 minimum
Final risk: 95

Interpretation:
  - At 90% autonomy: 95 > 90 → Ask approval
  - At 99% autonomy: 95 > 99 → ... wait, no
  - At 99% autonomy: 95 < 99 → Actually auto-allowed
  - This might need adjustment! Maybe 95 should always ask?
```

---

### Complexity Scoring Rubric (0-100)

**Assesses: "How complex is this decision?"**

#### Multiple Valid Approaches?

```typescript
APPROACH_COMPLEXITY = {
  many_equally_valid: 80,      // 3+ good options
  few_alternatives: 50,        // 2 solid options
  one_clear_best: 20,          // Obvious choice
};
```

#### Technical Depth Required?

```typescript
DEPTH_COMPLEXITY = {
  deep_expertise: 80,          // Security, performance, architecture
  moderate_knowledge: 50,      // Framework patterns
  common_practice: 20,         // Standard operations
};
```

#### Impact of Wrong Choice?

```typescript
IMPACT_COMPLEXITY = {
  hard_to_change_later: +20,   // Architectural decisions
  refactorable: +10,           // Can change if needed
  easily_changed: +5,          // Trivial to redo
};
```

#### User Context Dependency?

```typescript
CONTEXT_COMPLEXITY = {
  depends_on_requirements: +30,  // Need user input
  best_practices_apply: +10,     // Industry standards exist
  obvious_from_code: +0,         // Clear from context
};
```

#### Trade-offs Involved?

```typescript
TRADEOFF_COMPLEXITY = {
  multiple_significant: +20,     // Performance vs readability
  minor_tradeoffs: +10,         // Slight differences
  no_tradeoffs: +0,             // Equivalent options
};
```

---

### Complexity Calculation Examples

#### Example 1: Authentication Approach Decision
```
Question: "Which authentication approach?"
Options: JWT, Sessions, OAuth

Calculation:
  Multiple approaches: 80
  + Deep expertise needed: 80
  + Hard to change later: 20
  + User requirements needed: 30
  + Major trade-offs: 20
  = 230 → cap at 100

Final complexity: 100

Interpretation:
  - At 50% autonomy: 100 > 40 (50*0.8) → Call RequestDecision
  - At 90% autonomy: 100 > 72 (90*0.8) → Still call RequestDecision
  - This is complex enough to ask at almost any autonomy level
```

#### Example 2: Directory Structure Preference
```
Question: "Put middleware in src/auth/ or src/middleware/auth/?"

Calculation:
  Few alternatives: 50
  + Common practice: 20
  + Easily changed: 5
  + No trade-offs: 0
  = 75

Final complexity: 75

Interpretation:
  - At 50% autonomy: 75 > 50 → Call RequestPreference
  - At 80% autonomy: 75 < 80 → Agent decides (follow conventions)
  - Medium complexity, subjective choice
```

#### Example 3: Add Standard Dependency
```
Operation: "Add bcrypt for password hashing"

Calculation:
  One clear approach: 20
  + Common practice: 20
  + Easily changed: 5
  + Obvious from context: 0
  = 45

Final complexity: 45

Interpretation:
  - At 50% autonomy: 45 < 40 (50*0.8) → Just do it
  - Low complexity, standard operation
```

---

### Subjectivity Scoring Rubric (0-100)

**Assesses: "Is this a preference-based choice?"**

#### Pure Style Preference?

```typescript
STYLE_SUBJECTIVITY = {
  pure_style: 90,              // Naming, formatting
  conventions_flexible: 50,    // Multiple valid patterns
  clear_best_practice: 10,     // Industry standard
};
```

#### Technical Equivalence?

```typescript
EQUIVALENCE_SUBJECTIVITY = {
  all_equally_valid: +40,      // No technical difference
  some_better: +20,            // Trade-offs exist
  one_objectively_better: +0,  // Clear winner
};
```

#### Domain Preference?

```typescript
DOMAIN_SUBJECTIVITY = {
  team_style: +30,             // "How we do it here"
  language_idiom: +20,         // Language-specific patterns
  universal: +0,               // Works everywhere
};
```

---

### Subjectivity Calculation Examples

#### Example 1: Variable Naming
```
Question: "Name variable 'userData' or 'user_data'?"

Calculation:
  Pure style: 90
  + All equally valid: 40
  = 130 → cap at 100

Final subjectivity: 100

Interpretation:
  - At any autonomy level: High subjectivity
  - But also low impact
  - Agent should follow project conventions (grep codebase)
  - Only ask if no clear pattern exists
```

#### Example 2: Directory Structure
```
Question: "Flat vs nested directory structure?"

Calculation:
  Conventions flexible: 50
  + Some better: 20
  + Team style: 30
  = 100

Final subjectivity: 100

Interpretation:
  - At 50% autonomy: 100 > 50 → Call RequestPreference
  - At 80% autonomy: 100 > 80 → Still ask (highly subjective)
```

#### Example 3: Error Handling Pattern
```
Question: "try-catch vs return codes?"

Calculation:
  Conventions flexible: 50
  + Some better: 20
  + Language idiom: 20
  = 90

Final subjectivity: 90

Interpretation:
  - Context matters (language, async vs sync)
  - At 50% autonomy: 90 > 50 → Ask for guidance
  - At 90% autonomy: 90 = 90 → Borderline, agent decides based on language
```

---

### AssessOperation Tool Definition

```typescript
{
  name: 'AssessOperation',
  description: `Assess operation risk, complexity, and subjectivity BEFORE executing.
                Use <thinking> block first to reason through rubrics.
                Then provide structured assessment.`,
  
  input_schema: {
    type: 'object',
    properties: {
      // What you're assessing
      operation: {
        type: 'string',
        description: 'Clear description of planned operation'
      },
      tool_name: {
        type: 'string',
        enum: ['Write', 'Edit', 'Bash', 'Agent'],
        description: 'Tool you plan to call next'
      },
      tool_input: {
        type: 'object',
        description: 'Parameters for the tool (e.g., {path: "...", content: "..."})'
      },
      
      // RISK ASSESSMENT
      risk_score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'Calculated risk score using rubric'
      },
      risk_factors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Risk factors identified (e.g., ["Config file", "Root scope", "Irreversible"])'
      },
      risk_calculation: {
        type: 'string',
        description: 'Show your calculation: "Base 60 + Modify 10 + Root 20 = 90"'
      },
      risk_reasoning: {
        type: 'string',
        description: 'Why this risk level? What could go wrong?'
      },
      
      // COMPLEXITY ASSESSMENT
      complexity_score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'Decision complexity using rubric'
      },
      complexity_factors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Complexity factors (e.g., ["Multiple approaches", "Trade-offs"])'
      },
      complexity_reasoning: {
        type: 'string',
        description: 'Why is this decision complex (or simple)?'
      },
      
      // SUBJECTIVITY ASSESSMENT
      subjectivity_score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'How preference-based is this?'
      },
      subjectivity_reasoning: {
        type: 'string',
        description: 'Why is this subjective (or objective)?'
      },
      
      // ENGAGEMENT RECOMMENDATIONS
      requires_decision: {
        type: 'boolean',
        description: 'Should RequestDecision be called? (complexity > autonomy * 0.8)'
      },
      requires_preference: {
        type: 'boolean',
        description: 'Should RequestPreference be called? (subjectivity > autonomy)'
      },
      requires_feedback: {
        type: 'boolean',
        description: 'Should RequestFeedback be called after? (if autonomy < 40%)'
      },
      requires_approval: {
        type: 'boolean',
        description: 'Should RequestApproval be called? (risk > autonomy)'
      },
      
      // ALTERNATIVES (for decisions)
      alternatives: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } }
          }
        },
        description: 'If decision required, list alternatives'
      },
      recommended_alternative: {
        type: 'string',
        description: 'Your recommendation (can be overridden by user)'
      }
    },
    required: [
      'operation', 'tool_name', 'tool_input',
      'risk_score', 'risk_factors', 'risk_calculation', 'risk_reasoning',
      'complexity_score', 'complexity_factors', 'complexity_reasoning',
      'subjectivity_score', 'subjectivity_reasoning',
      'requires_decision', 'requires_preference', 'requires_feedback', 'requires_approval'
    ]
  }
}
```

---

---

### Backend Validation (Comprehensive Rubrics)

**The backend enforces exact rubrics using code (zero token cost).**

While the LLM learns from few-shot examples, the backend has exhaustive lookup tables:

```typescript
// src/main/agent/assessment/risk-calculator.ts

// Comprehensive file type scores (not in prompt)
const FILE_TYPE_SCORES: Record<string, number> = {
  // Critical
  '.env': 85,
  '.env.local': 85,
  '.env.production': 90,
  '.env.development': 80,
  '.git/config': 90,
  '.git/hooks/*': 85,
  'id_rsa': 100,
  'id_rsa.pub': 80,
  
  // Config
  'package.json': 60,
  'package-lock.json': 55,
  'tsconfig.json': 60,
  'webpack.config.js': 60,
  'next.config.js': 60,
  'vite.config.ts': 60,
  '.eslintrc.js': 50,
  '.prettierrc': 45,
  
  // Infrastructure
  'Dockerfile': 65,
  'docker-compose.yml': 65,
  '.github/workflows/*': 70,
  'vercel.json': 60,
  
  // Source (by path pattern)
  'src/**/*.ts': 30,
  'src/**/*.tsx': 30,
  'src/**/*.js': 30,
  'src/**/*.jsx': 30,
  'lib/**/*.ts': 30,
  'components/**/*.tsx': 30,
  
  // Tests
  '**/*.test.ts': 15,
  '**/*.test.tsx': 15,
  '**/*.spec.ts': 15,
  'test/**/*': 15,
  '__tests__/**/*': 15,
  
  // Docs
  '**/*.md': 10,
  'docs/**/*': 10,
  'README.md': 12,
  
  // Generated/temp
  'node_modules/**': 90,  // Deleting is dangerous
  'dist/**': 40,
  'build/**': 40,
  '.next/**': 40,
  
  // Default fallback
  '*': 50
};

const OPERATION_MODIFIERS = {
  delete: 30,
  modify: 10,
  create: 5
};

const COMMAND_PATTERNS: Array<{pattern: RegExp; score: number}> = [
  // Catastrophic
  { pattern: /^rm\s+-rf\s+\//, score: 100 },
  { pattern: /^sudo\s+rm\s+-rf/, score: 100 },
  
  // Dangerous
  { pattern: /^rm\s+-rf/, score: 95 },
  { pattern: /^sudo/, score: 90 },
  { pattern: /git\s+push.*\b(main|master)\b/, score: 85 },
  { pattern: /npm\s+publish/, score: 80 },
  { pattern: /yarn\s+publish/, score: 80 },
  
  // Risky
  { pattern: /git\s+push/, score: 70 },
  { pattern: /npm\s+install/, score: 40 },
  { pattern: /yarn\s+install/, score: 40 },
  { pattern: /pip\s+install/, score: 35 },
  
  // Safe
  { pattern: /^git\s+status/, score: 5 },
  { pattern: /^git\s+diff/, score: 5 },
  { pattern: /^git\s+log/, score: 5 },
  { pattern: /^ls/, score: 0 },
  { pattern: /^grep/, score: 0 },
  { pattern: /^cat/, score: 0 },
  { pattern: /^npm\s+test/, score: 10 },
  { pattern: /^npm\s+run\s+test/, score: 10 },
];

// Calculate expected risk from rubrics
export function calculateExpectedRisk(
  toolName: string,
  input: Record<string, unknown>
): number {
  
  if (toolName === 'Bash') {
    const cmd = input.command as string;
    // Check command patterns
    for (const { pattern, score } of COMMAND_PATTERNS) {
      if (pattern.test(cmd)) {
        return score;
      }
    }
    return 50; // Unknown command
  }
  
  if (toolName === 'Write' || toolName === 'Edit') {
    const path = input.path as string;
    
    // Find matching file type
    const baseScore = getFileTypeScore(path);
    
    // Add operation modifier
    const operation = toolName === 'Write' ? 'create' : 'modify';
    const modifier = OPERATION_MODIFIERS[operation] || 0;
    
    return Math.min(baseScore + modifier, 100);
  }
  
  return 50; // Unknown tool
}

function getFileTypeScore(path: string): number {
  // Check exact matches first
  if (FILE_TYPE_SCORES[path]) {
    return FILE_TYPE_SCORES[path];
  }
  
  // Check pattern matches
  for (const [pattern, score] of Object.entries(FILE_TYPE_SCORES)) {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      if (regex.test(path)) {
        return score;
      }
    }
  }
  
  return FILE_TYPE_SCORES['*']; // Default
}

// Validate LLM's score against expected
export function validateAssessment(
  llmScore: number,
  expectedScore: number,
  tolerance: number = 20
): {
  valid: boolean;
  deviation: number;
  suggestedScore: number;
} {
  const deviation = Math.abs(llmScore - expectedScore);
  
  if (deviation <= tolerance) {
    return {
      valid: true,
      deviation,
      suggestedScore: llmScore
    };
  }
  
  // LLM deviated too much, use higher score (safer)
  return {
    valid: false,
    deviation,
    suggestedScore: Math.max(llmScore, expectedScore)
  };
}
```

**How Backend Validation Works:**

1. **LLM assesses** using few-shot examples → scores: 75
2. **Backend calculates** using exact rubrics → expected: 70
3. **Compare:** |75 - 70| = 5 ✓ (within tolerance)
4. **Use LLM score:** 75
5. **Apply hard limit:** max(75, 60) = 75
6. **Final risk:** 75

**If LLM deviates significantly:**

1. LLM scores: 40
2. Backend expects: 70
3. Deviation: 30 > 20 tolerance ❌
4. Log warning + use higher score: 70
5. Apply hard limit: max(70, 60) = 70
6. Final risk: 70 (safer)

**Benefits:**
- LLM provides reasoning and context
- Backend ensures accuracy
- Safety net for LLM mistakes
- No extra tokens for comprehensive rubrics

---

### Backend Assessment Handler

```typescript
interface AssessmentInput {
  operation: string;
  tool_name: 'Write' | 'Edit' | 'Bash' | 'Agent';
  tool_input: Record<string, unknown>;
  
  risk_score: number;
  risk_factors: string[];
  risk_calculation: string;
  risk_reasoning: string;
  
  complexity_score: number;
  complexity_factors: string[];
  complexity_reasoning: string;
  
  subjectivity_score: number;
  subjectivity_reasoning: string;
  
  requires_decision: boolean;
  requires_preference: boolean;
  requires_feedback: boolean;
  requires_approval: boolean;
  
  alternatives?: Array<{
    name: string;
    description: string;
    pros: string[];
    cons: string[];
  }>;
  recommended_alternative?: string;
}

async function handleAssessOperation(input: AssessmentInput): Promise<ToolResult> {
  const autonomy = session.autonomyLevel;
  
  // 1. Apply hard limits to risk score
  const hardLimit = getHardLimit(input.tool_name, input.tool_input);
  const finalRisk = Math.max(input.risk_score, hardLimit);
  const hardLimitApplied = finalRisk > input.risk_score;
  
  // 2. Validate scores are reasonable
  if (input.risk_score < 0 || input.risk_score > 100) {
    return {
      behavior: 'deny',
      error: 'Invalid risk_score: must be 0-100'
    };
  }
  
  // 3. Check thresholds against autonomy level
  const needsEngagement = {
    decision: input.complexity_score > autonomy * 0.8,
    preference: input.subjectivity_score > autonomy,
    approval: finalRisk > autonomy,
    feedback: autonomy < 40 && input.requires_feedback
  };
  
  // 4. Override agent's assessment if necessary
  if (needsEngagement.decision && !input.requires_decision) {
    logger.warn('Agent missed decision requirement', {
      complexity: input.complexity_score,
      autonomy,
      threshold: autonomy * 0.8
    });
    needsEngagement.decision = true;
  }
  
  // 5. Log assessment for calibration
  await logAssessment({
    ...input,
    finalRisk,
    hardLimitApplied,
    needsEngagement,
    autonomyLevel: autonomy,
    timestamp: Date.now()
  });
  
  // 6. Store assessment for next tool call
  session.pendingAssessment = {
    ...input,
    finalRisk,
    hardLimitApplied,
    hardLimitReason: hardLimitApplied ? getHardLimitReason(input.tool_name, input.tool_input) : undefined,
    needsEngagement
  };
  
  // 7. Return guidance to agent
  return {
    behavior: 'allow',
    updatedInput: {
      assessment_stored: true,
      final_risk: finalRisk,
      hard_limit_applied: hardLimitApplied,
      
      should_call_next: [
        needsEngagement.decision && 'RequestDecision',
        needsEngagement.preference && 'RequestPreference',
        needsEngagement.approval && 'RequestApproval'
      ].filter(Boolean),
      
      can_proceed_directly: !Object.values(needsEngagement).some(Boolean)
    }
  };
}
```

---

### System Prompt Integration

**The assessment guidance is already defined above in "System Prompt Strategy: Few-Shot Learning".**

Key points for integration:
- Use the lightweight few-shot examples (~800 tokens)
- LLM learns patterns from examples
- Backend validates and enforces exact rubrics
- Examples can be updated based on calibration findings

**Workflow Summary:**

```typescript
const systemPrompt = `
You are Minimalist Agent.

USER AUTONOMY LEVEL: ${autonomyLevel}%

[... other instructions ...]

${assessmentGuidance}  // The few-shot examples from above

WORKFLOW:
1. Before Write/Edit/Bash, use <thinking> to assess
2. Call AssessOperation with your scores
3. Backend validates and applies safety minimums
4. Follow backend's guidance (should_call_next)
`;
```

**Token Budget:**
- Base system prompt: ~1,000-1,500 tokens
- Assessment guidance: ~800 tokens
- **Total: ~1,800-2,300 tokens** (vs 3,500-4,500 with exhaustive rubrics)
- **Savings: ~40-50% of prompt tokens**

---

### Calibration Process

**Ongoing refinement of rubrics and thresholds.**

#### Phase 1: Initial Testing (Week 1-2)

```yaml
Objective: Validate rubrics with real operations

Tasks:
  - Run 50+ test operations across all file types
  - Collect assessments from logs
  - Compare LLM scores vs expected scores
  - Identify systematic biases
  
Metrics:
  - Score accuracy (± 10 points)
  - Engagement appropriateness (user feedback)
  - False positives (unnecessary prompts)
  - False negatives (missed risks)
```

#### Phase 2: Few-Shot Example Refinement (Week 3-4)

```yaml
Objective: Improve LLM assessment accuracy

Tasks:
  - Identify operations where LLM consistently mis-scores
  - Add new few-shot examples for common mistakes
  - Update existing examples with better reasoning
  - Remove examples that don't improve accuracy
  
Process:
  - Review assessment logs
  - Find patterns: "LLM always under-scores X"
  - Add example showing correct scoring for X
  - Deploy updated prompt
  - Re-test accuracy
  
Changes:
  - Add 2-3 new examples (targeting weaknesses)
  - Refine example reasoning (show better thinking)
  - Keep total under 10 examples (token budget)
  
Backend Changes:
  - Update exact rubrics in code
  - Adjust hard limits if needed
  - No prompt changes for backend-only fixes
```

#### Phase 3: Hard Limit Tuning (Week 5-6)

```yaml
Objective: Ensure safety net catches all risks

Tasks:
  - Review operations where LLM under-scored
  - Add hard limits for missed patterns
  - Test with adversarial examples
  
Test cases:
  - LLM says "safe" but actually catastrophic
  - Hard limit should catch it
```

#### Phase 4: User Testing (Week 7-8)

```yaml
Objective: Validate with real users

Tasks:
  - 10+ users test at different autonomy levels
  - Collect feedback on engagement frequency
  - Measure denial rates
  - Identify annoying prompts
  
Metrics:
  - User satisfaction scores
  - Trust level changes over time
  - Engagement appropriateness ratings
```

#### Ongoing Monitoring

```typescript
// Collect metrics for continuous improvement

interface AssessmentMetrics {
  // Accuracy
  score_accuracy: number;           // How close to "true" risk?
  engagement_appropriateness: number; // User feedback
  
  // Safety
  false_negatives: number;          // Missed risks
  hard_limit_catches: number;       // Safety net activations
  
  // UX
  false_positives: number;          // Unnecessary prompts
  user_denial_rate: number;         // How often user says "no"
  
  // Calibration
  systematic_bias: number;          // Consistent over/under scoring
  edge_cases: Array<{               // Operations needing special handling
    operation: string;
    llm_score: number;
    actual_risk: number;
    reason: string;
  }>;
}

// Weekly review:
// - If false_negatives > 0: Add hard limits
// - If false_positives > 20%: Lower thresholds or refine rubric
// - If systematic_bias detected: Adjust rubric weights
```

---

### Testing Strategy

#### Unit Tests: Rubric Application

```typescript
describe('Risk Assessment', () => {
  it('calculates risk for config file edit', () => {
    const assessment = assessRisk({
      file: 'package.json',
      operation: 'modify',
      scope: 'root',
      reversibility: 'git_revert',
      impact: 'dependencies'
    });
    
    expect(assessment.score).toBeGreaterThanOrEqual(60); // Hard limit
    expect(assessment.score).toBeLessThanOrEqual(80);
    expect(assessment.factors).toContain('Config file');
  });
  
  it('applies hard limit minimum', () => {
    const assessment = assessRisk({
      file: 'package.json',
      operation: 'create',  // Low risk operation
      // ... but package.json has hard limit
    });
    
    expect(assessment.finalRisk).toBeGreaterThanOrEqual(60);
  });
  
  it('caps risk at 100', () => {
    const assessment = assessRisk({
      file: '.env',
      operation: 'delete',
      scope: 'root',
      reversibility: 'irreversible',
      impact: 'critical'
    });
    
    expect(assessment.score).toBeLessThanOrEqual(100);
  });
});
```

#### Integration Tests: Full Assessment Flow

```typescript
describe('Assessment Flow', () => {
  it('requires approval when risk > autonomy', async () => {
    session.autonomyLevel = 50;
    
    const result = await handleAssessOperation({
      operation: 'Edit package.json',
      risk_score: 75,
      complexity_score: 20,
      subjectivity_score: 0,
      requires_approval: true,
      // ...
    });
    
    expect(result.updatedInput.should_call_next).toContain('RequestApproval');
  });
  
  it('auto-allows when risk < autonomy', async () => {
    session.autonomyLevel = 80;
    
    const result = await handleAssessOperation({
      operation: 'Edit src/utils.ts',
      risk_score: 30,
      complexity_score: 20,
      subjectivity_score: 0,
      requires_approval: false,
      // ...
    });
    
    expect(result.updatedInput.can_proceed_directly).toBe(true);
  });
});
```

#### End-to-End Tests: Real Agent Operations

```typescript
describe('Real Operations', () => {
  it('handles authentication implementation', async () => {
    const agent = createTestAgent({ autonomy: 50 });
    
    await agent.processMessage('Add JWT authentication');
    
    // Should show planning phases
    expect(agent.messages).toContainMatch(/Phase 1: Exploring/);
    
    // Should assess before editing package.json
    expect(agent.toolCalls).toContain('AssessOperation');
    
    // Should request approval for high-risk operation
    expect(agent.toolCalls).toContain('RequestApproval');
    
    // After approval, should proceed
    expect(agent.toolCalls).toContain('Edit');
  });
});
```

---

### Assessment Quality Metrics

**Track these over time:**

```typescript
interface QualityMetrics {
  // Accuracy (how close to "ground truth")
  risk_accuracy: {                    // ± points from expert assessment
    mean_error: number;
    std_dev: number;
    within_10_points: number;         // % within ±10
    within_20_points: number;         // % within ±20
  };
  
  // Engagement Quality
  appropriate_prompts: number;        // User rated as "should have asked"
  inappropriate_prompts: number;      // User rated as "annoying"
  missed_engagement: number;          // User wanted to be asked
  
  // Safety
  catastrophic_missed: number;        // High-risk ops that slipped through
  hard_limit_saves: number;           // Times hard limit prevented disaster
  
  // Performance
  assessment_time: number;            // ms per assessment
  token_usage: number;                // tokens per assessment
};

// Target goals:
// - risk_accuracy.within_10_points > 80%
// - appropriate_prompts / total_prompts > 90%
// - catastrophic_missed = 0
// - assessment_time < 500ms
```

---

### Few-Shot Examples for System Prompt

**Include in system prompt to improve accuracy:**

```typescript
const fewShotExamples = `
ASSESSMENT EXAMPLES:

Example 1: Config File Edit
<thinking>
Operation: Add bcrypt to package.json
- File: package.json (base: 60)
- Operation: Modify (+ 10)
- Impact: Dependencies (+ 15)
- Total: 85... too high, recalculate
- Actually: 60 + 15 = 75
- Hard limit: 60 (package.json)
- Final: max(75, 60) = 75
</thinking>

AssessOperation:
  risk_score: 75
  risk_calculation: "Base 60 + Dependency 15 = 75"
  complexity_score: 20 (standard operation)
  requires_approval: true (if autonomy < 75)

Example 2: Source Code Edit
<thinking>
Operation: Create src/auth/middleware.ts
- File: src/ .ts (base: 30)
- Operation: Create (+ 5)
- Impact: Important feature (+ 15)
- Total: 50
- No hard limit
- Final: 50
</thinking>

AssessOperation:
  risk_score: 50
  complexity_score: 40 (auth is moderately complex)
  requires_approval: true (if autonomy < 50)

Example 3: Documentation
<thinking>
Operation: Create docs/api.md
- File: docs/ .md (base: 10)
- Operation: Create (+ 5)
- Impact: Dev only (+ 5)
- Total: 20
- No hard limit
- Final: 20
</thinking>

AssessOperation:
  risk_score: 20
  complexity_score: 10 (straightforward)
  requires_approval: false (at most autonomy levels)

Example 4: Dangerous Command
<thinking>
Operation: Run "rm -rf node_modules"
- Command: rm -rf pattern (base: 95)
- Hard limit: 95
- Final: 95
</thinking>

AssessOperation:
  risk_score: 95
  complexity_score: 10 (simple operation, but high risk)
  requires_approval: true (at almost any autonomy)
`;
```

---

### Investment Required

**Dedicated effort for assessment system:**

```yaml
Initial Implementation:
  Rubric Design: 4-6 hours
  Tool Definition: 3-4 hours
  Backend Handler: 4-5 hours
  System Prompt Integration: 3-4 hours
  Few-Shot Examples: 2-3 hours
  Unit Tests: 3-4 hours
  
  Subtotal: 19-26 hours

Calibration & Testing:
  Initial Testing: 6-8 hours
  Rubric Refinement: 4-6 hours
  Hard Limit Tuning: 4-6 hours
  User Testing: 6-8 hours
  
  Subtotal: 20-28 hours

Total Initial Investment: 39-54 hours

Ongoing Maintenance:
  Weekly metric review: 1-2 hours
  Monthly rubric updates: 2-4 hours
  Quarterly comprehensive audit: 4-8 hours
```

---

### Assessment Methodology Summary

**The token-efficient hybrid approach:**

#### What Goes in System Prompt (~800 tokens)
1. High-level principles (file types, operations, commands)
2. 5-8 few-shot examples showing assessment patterns
3. Workflow instructions

**Benefits:**
- LLM learns patterns from examples
- Flexible reasoning for edge cases
- Easy to update (add/remove examples)
- **70% token savings** vs exhaustive rubrics

#### What Goes in Backend Code (0 tokens)
1. Comprehensive file type scores (100+ patterns)
2. Exhaustive command patterns (50+ regex)
3. Exact calculation formulas
4. Hard limit lookup tables
5. Validation logic

**Benefits:**
- Zero token cost
- Enforces accuracy
- Easy to maintain and extend
- Can be updated without prompt changes
- Catches LLM mistakes

#### How They Work Together
```
User Request → LLM uses principles + examples → Scores: 75
              ↓
         Backend validates using rubrics → Expected: 70
              ↓
         Deviation check: |75-70| = 5 ✓
              ↓
         Apply hard limits: max(75, 60) = 75
              ↓
         Final Risk: 75
```

#### Token Cost Analysis

| Approach | Tokens/Request | Monthly Cost (1M tokens) | Accuracy |
|----------|----------------|--------------------------|----------|
| **Exhaustive in prompt** | 2,500-3,500 | $75-105 | 95% |
| **Few-shot + backend** | 800 | $24 | 92-95% |
| **No guidance** | 100 | $3 | 60-70% |

**Recommended: Few-shot + backend** (95% accuracy, 70% cost savings)

#### Why This Works

**LLM strengths:**
- Pattern recognition from examples
- Contextual reasoning
- Edge case handling
- Explaining reasoning

**Backend strengths:**
- Exact calculations
- Comprehensive coverage
- Zero cost
- Deterministic safety

**Together:** Best of both worlds - intelligent + accurate + affordable.

---

### Success Criteria

**Assessment system is successful if:**

1. ✅ **Accurate** - Risk scores within ±10 points of expert assessment 80% of time
2. ✅ **Safe** - Zero catastrophic operations slip through (hard limits work)
3. ✅ **Appropriate** - >90% of prompts rated "should have asked" by users
4. ✅ **Not Annoying** - <10% of prompts rated "unnecessary" by users
5. ✅ **Fast** - Assessment adds <500ms overhead per operation
6. ✅ **Debuggable** - Can trace why any decision was made
7. ✅ **Improvable** - Clear metrics guide rubric refinements

---

## Implementation Details

### New Tools

#### 1. RequestDecision
```typescript
{
  name: 'RequestDecision',
  description: 'Ask user to make a decision',
  input_schema: {
    question: string,           // "Which auth approach?"
    options: Array<{
      name: string,             // "JWT tokens"
      description: string,      // "Stateless, scalable..."
      pros: string[],
      cons: string[]
    }>,
    recommendation?: string,    // Agent's suggestion
    impact: 'low' | 'medium' | 'high'
  }
}
```

#### 2. RequestFeedback
```typescript
{
  name: 'RequestFeedback',
  description: 'Ask for user feedback on work',
  input_schema: {
    completed_work: string,     // "Created middleware"
    preview?: string,           // Code preview
    question: string            // "Does this look right?"
  }
}
```

#### 3. RequestPreference
```typescript
{
  name: 'RequestPreference',
  description: 'Ask for user preference',
  input_schema: {
    question: string,           // "Directory structure?"
    options: string[],          // ["src/auth/", "src/middleware/auth/"]
    reasoning?: string          // "Both work, stylistic choice"
  }
}
```

#### 4. RequestGuidance
```typescript
{
  name: 'RequestGuidance',
  description: 'Ask for user guidance on priorities',
  input_schema: {
    situation: string,          // "Can optimize for..."
    tradeoffs: Array<{
      option: string,
      benefits: string[],
      costs: string[]
    }>
  }
}
```

#### 5. RequestApproval
```typescript
{
  name: 'RequestApproval',
  description: 'Request permission for operation',
  input_schema: {
    operation: string,
    risk_score: number,
    reasoning: string,
    files_affected: string[]
  }
}
```

#### 6. ReportPhase
```typescript
{
  name: 'ReportPhase',
  description: 'Report planning phase progress (always call)',
  input_schema: {
    phase: number,              // 1, 2, 3
    name: string,               // "Exploring codebase"
    findings: string[]          // Key discoveries
  }
}
```

---

### System Prompt Enhancement

```typescript
const systemPrompt = `
You are Minimalist Agent.

USER AUTONOMY LEVEL: ${autonomyLevel}%

This controls how often you engage the user in decisions.

TRANSPARENCY: ALWAYS CONSTANT
- Always call ReportPhase to show planning progress
- Always show execution progress
- Always explain your reasoning
- NEVER work silently or hide information

AUTONOMY: VARIABLE (based on slider)

At ${autonomyLevel}% autonomy:
${getAutonomyGuidance(autonomyLevel)}

WHEN TO ENGAGE USER:

1. RequestDecision - When multiple valid approaches exist
   - Low autonomy (<40%): Ask about most decisions
   - Mid autonomy (40-70%): Ask about major decisions only
   - High autonomy (>70%): Make decisions, only ask if ambiguous
   
2. RequestPreference - When subjective choices arise
   - Low autonomy: Ask about naming, structure, style
   - Mid autonomy: Follow conventions, ask if multiple valid patterns
   - High autonomy: Follow conventions, decide independently
   
3. RequestFeedback - After completing work
   - Low autonomy: Ask after each task
   - Mid autonomy: Ask after major tasks only
   - High autonomy: Don't ask (user can see progress)
   
4. RequestGuidance - When trade-offs exist
   - Low autonomy: Ask about optimization priorities
   - Mid autonomy: Ask only for major trade-offs
   - High autonomy: Use reasonable defaults
   
5. RequestApproval - Before risky operations
   - Always check: operation_risk > ${autonomyLevel}%
   - Hard limits apply (see below)

MINIMUM RISK LEVELS (always enforced):
- rm/sudo commands: minimum 90%
- Deleting files: minimum 70%
- .env files: minimum 85%
- Git push to main/master: minimum 85%
- Config files (package.json, tsconfig): minimum 60%

DECISION ASSESSMENT:
Before making a decision, assess:
- Complexity: How many valid approaches? (0-100%)
- Subjectivity: Is this preference-based? (0-100%)
- Impact: How critical is this decision? (low/medium/high)

If complexity or subjectivity > ${autonomyLevel}%, engage user.

EXAMPLE AT ${autonomyLevel}% AUTONOMY:
${getAutonomyExample(autonomyLevel)}

Remember: ALWAYS show your work. NEVER hide planning or execution.
The slider controls engagement frequency, not transparency.
`;
```

---

### Backend Flow

```typescript
interface AutoModeConfig {
  autonomyLevel: number; // 0-100
}

// Multi-factor decision making
function shouldEngageUser(
  engagementType: 'decision' | 'preference' | 'feedback' | 'guidance' | 'approval',
  complexity: number,
  autonomy: number
): boolean {
  
  // Different thresholds for different engagement types
  const thresholds = {
    decision: autonomy * 0.8,      // Engage if decision complexity > 80% of autonomy
    preference: autonomy * 1.0,    // Engage if preference subjectivity > autonomy
    feedback: autonomy * 1.2,      // Less frequent, only if really needs input
    guidance: autonomy * 0.9,      // Trade-offs are important
    approval: autonomy * 1.0       // Standard risk threshold
  };
  
  return complexity > thresholds[engagementType];
}

// In canUseTool callback
async function canUseTool(toolName: string, input: any) {
  
  // Transparency tools - always allow
  if (toolName === 'ReportPhase') {
    await showPlanningPhase(input);
    return { behavior: 'allow', updatedInput: {} };
  }
  
  // Engagement tools - show dialog
  if (toolName === 'RequestDecision') {
    const decision = await showDecisionDialog(input);
    return { behavior: 'allow', updatedInput: { decision } };
  }
  
  if (toolName === 'RequestPreference') {
    const preference = await showPreferenceDialog(input);
    return { behavior: 'allow', updatedInput: { preference } };
  }
  
  if (toolName === 'RequestFeedback') {
    const feedback = await showFeedbackDialog(input);
    return { behavior: 'allow', updatedInput: { feedback } };
  }
  
  if (toolName === 'RequestGuidance') {
    const guidance = await showGuidanceDialog(input);
    return { behavior: 'allow', updatedInput: { guidance } };
  }
  
  if (toolName === 'RequestApproval') {
    const { operation, risk_score, reasoning } = input;
    
    // Apply hard limits
    const { finalRisk, reason } = enforceHardLimits(operation, risk_score);
    
    const approved = await showApprovalDialog({
      operation,
      risk: finalRisk,
      reasoning,
      hardLimitEnforced: finalRisk > risk_score,
      autonomyLevel: session.autonomyLevel
    });
    
    return approved ? { behavior: 'allow' } : { behavior: 'deny' };
  }
  
  // Other tools - trust agent's judgment
  return { behavior: 'allow', updatedInput: input };
}
```

---

## User Experience

### Dialog Types

**IMPORTANT: All dialogs support freeform input for open discussion.**

Users are never forced to choose from predefined options. Every dialog includes a text input where users can explain their specific needs, ask questions, or propose alternatives.

#### Decision Dialog
```
┌────────────────────────────────────────────┐
│ 🤔 Decision Required                       │
├────────────────────────────────────────────┤
│                                            │
│ Which authentication approach?             │
│                                            │
│ ○ JWT Tokens (recommended)                 │
│   ✓ Stateless, scales well                 │
│   ✓ Works with mobile/SPA                  │
│   ✗ More complex setup                     │
│                                            │
│ ○ Session Cookies                          │
│   ✓ Simpler implementation                 │
│   ✓ Built-in to most frameworks            │
│   ✗ Server state required                  │
│                                            │
│ ○ OAuth                                    │
│   ✓ Third-party auth (Google, GitHub)      │
│   ✗ Significantly more complex             │
│                                            │
│ Agent recommends: JWT (best for your arch) │
│                                            │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
│ Or describe what you need:                 │
│ ┌────────────────────────────────────────┐ │
│ │ e.g., "JWT for API, sessions for admin"│ │
│ │                                        │ │
│ └────────────────────────────────────────┘ │
│                                            │
├────────────────────────────────────────────┤
│ [Select Option] [Submit Custom] [Discuss] │
└────────────────────────────────────────────┘
```

**When user types custom response:**
- Continues conversation naturally
- Agent responds to their specific requirements
- Can ask follow-up questions
- Collaborative discussion, not forced choice

#### Preference Dialog
```
┌────────────────────────────────────────────┐
│ 🎨 Your Preference?                        │
├────────────────────────────────────────────┤
│                                            │
│ Directory structure for auth code:         │
│                                            │
│ ○ src/auth/                                │
│   Flat structure, simpler                  │
│                                            │
│ ○ src/middleware/auth/                     │
│   More organized, follows category pattern │
│                                            │
│ Both are valid. Your choice!               │
│                                            │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
│ Or specify your preference:                │
│ ┌────────────────────────────────────────┐ │
│ │ e.g., "Follow existing patterns" or    │ │
│ │ "I prefer feature-based structure"     │ │
│ └────────────────────────────────────────┘ │
│                                            │
├────────────────────────────────────────────┤
│ [Select Option] [Submit Custom] [Discuss] │
└────────────────────────────────────────────┘
```

#### Feedback Dialog
```
┌────────────────────────────────────────────┐
│ 💬 Feedback Requested                      │
├────────────────────────────────────────────┤
│                                            │
│ Created auth middleware:                   │
│                                            │
│ [Code preview - click to expand]           │
│ export const authMiddleware = ...          │
│                                            │
│ Does this look right?                      │
│ Any changes needed?                        │
│                                            │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
│ Your feedback:                             │
│ ┌────────────────────────────────────────┐ │
│ │ e.g., "Add error handling" or          │ │
│ │ "Use async/await instead"              │ │
│ └────────────────────────────────────────┘ │
│                                            │
├────────────────────────────────────────────┤
│ [Looks Good] [Submit Feedback] [Discuss]  │
└────────────────────────────────────────────┘
```

#### Guidance Dialog
```
┌────────────────────────────────────────────┐
│ 🧭 Guidance Needed                         │
├────────────────────────────────────────────┤
│                                            │
│ Trade-off decision:                        │
│                                            │
│ ○ Optimize for Performance                 │
│   ✓ Faster auth checks                     │
│   ✗ More memory usage                      │
│   ✗ Complex caching logic                  │
│                                            │
│ ○ Optimize for Readability                 │
│   ✓ Easier to maintain                     │
│   ✓ Simpler code                           │
│   ✗ Slightly slower                        │
│                                            │
│ What's your priority?                      │
│                                            │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
│ Or specify your priorities:                │
│ ┌────────────────────────────────────────┐ │
│ │ e.g., "Balance both" or                │ │
│ │ "Fast but keep it maintainable"        │ │
│ └────────────────────────────────────────┘ │
│                                            │
├────────────────────────────────────────────┤
│ [Performance] [Readability] [Submit] [Discuss]│
└────────────────────────────────────────────┘
```

#### Approval Dialog
```
┌────────────────────────────────────────────┐
│ ⚠️ Approval Required                       │
├────────────────────────────────────────────┤
│                                            │
│ Operation: Modify package.json             │
│ Risk Level: 65%                            │
│                                            │
│ Reason: Adding JWT dependencies            │
│ • @auth/core                               │
│ • bcrypt                                   │
│ • jsonwebtoken                             │
│                                            │
│ Your autonomy level: 50%                   │
│                                            │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
│ Questions or modifications?                │
│ ┌────────────────────────────────────────┐ │
│ │ e.g., "Use different package" or       │ │
│ │ "Why these specific versions?"         │ │
│ └────────────────────────────────────────┘ │
│                                            │
├────────────────────────────────────────────┤
│ [Allow] [Deny] [Modify] [Discuss]        │
└────────────────────────────────────────────┘
```

**Note:** Even approval dialogs allow discussion. User might want to:
- Ask why this specific approach
- Request different dependencies
- Understand implications
- Suggest modifications

---

## Key Technical Decisions

### 1. **Why Separate Transparency from Autonomy?**

**Attempted (wrong):** High autonomy = hide planning, work in background
**Realized:** Transparency and autonomy are different concerns

**Transparency = information** (what's happening)
**Autonomy = participation** (how often you're asked)

High autonomy should mean "I trust you to decide" NOT "hide what you're doing"

Benefits:
- Users always understand what happened
- Trust builds through observation
- Debugging is possible
- Educational value maintained
- Respects user intelligence

### 2. **Why "Autonomy Level" Instead of "Trust Level"?**

"Trust" implies safety only. "Autonomy" better captures the full scope:
- How often to ask for decisions
- How often to seek preferences
- How often to request feedback
- How often to need guidance
- How often to require approval

"Autonomy" = degree of independent decision-making authority

### 3. **Why Multiple Engagement Tools (5 types)?**

Not all human involvement is the same:
- Decisions require analysis of options
- Preferences are subjective choices
- Feedback validates completed work
- Guidance resolves trade-offs
- Approval gates risky operations

Each has different triggers and thresholds based on autonomy level.

### 4. **Why Always Show Planning Phases?**

Even at 99% autonomy, user should see:
```
Phase 1: Exploring ✓
Phase 2: Analyzing ✓  
Phase 3: Designing ✓
```

Benefits:
- User knows agent is working (not stuck)
- Can interrupt if going wrong direction
- Learns agent's approach
- Builds confidence through transparency
- Debugging when things go wrong

Only thing that changes with autonomy: how often agent pauses to ask.

### 5. **Why Continuous Slider Instead of Discrete Levels?**

Autonomy is a spectrum, not categories:
- 45% autonomy ≠ 55% autonomy
- LLM can assess engagement needs at any granularity
- Users can fine-tune to exact preference
- No arbitrary boundaries

Discrete levels would force artificial categorization.

---

## Benefits Over Current System

### Current (Plan/Ask/Auto)
```
Plan: Read-only ✓
Ask: Confirm every write (annoying, used rarely)
Auto: No prompts (black box at high trust)

Problems:
- Ask mode too annoying → everyone avoids it
- Auto mode hides work → black box
- No nuance in engagement
- Binary: either ask always or never
- No collaboration options
- Transparency sacrificed for speed
```

### New System (Plan/Auto + Autonomy Slider)
```
Plan: Read-only exploration ✓
Auto: Transparent execution with variable autonomy

Benefits:
- Always transparent (never black box)
- Continuous autonomy control (0-100%)
- Rich engagement options (5 types, not just approval)
- LLM-based intelligent engagement decisions
- Hard limits protect against catastrophic errors
- Educational (watch agent work at all trust levels)
- Trust builds through observation
- Flexible (adjust anytime)
- Default 50% = balanced collaboration
```

---

## Implementation Phases

### Phase 1: Assessment Methodology (19-26 hours)
**CRITICAL FOUNDATION - Must be accurate for system to work**

#### Comprehensive Rubrics (Backend Code)
- Design exhaustive scoring rubrics **in backend code** (not prompt)
  - File type base scores (100+ patterns)
  - Operation modifiers (create/modify/delete)
  - Command risk patterns (50+ regex patterns)
  - Scope/reversibility/impact modifiers
- Implement risk calculator module
- Implement complexity/subjectivity calculators
- Hard limit lookup tables

#### Few-Shot Examples (System Prompt - Token Efficient)
- Create 5-8 representative examples (~800 tokens total)
- Cover common scenarios:
  - Config file edit
  - Source code creation
  - Critical file deletion
  - Dangerous command
  - Documentation
  - Architectural decision
  - Style preference
  - Safe operation
- High-level principles (file sensitivity, operations, commands)
- Keep under 1,000 tokens

#### AssessOperation Tool
- Tool definition with structured output
- Validation schema

#### Backend Assessment Handler
- LLM score validation against expected scores
- Deviation detection and logging
- Hard limit application
- Threshold checking (autonomy level)
- Assessment logging for calibration
- Score override logic (use safer score)

#### Unit Tests
- Test backend risk calculator
- Test score validation
- Test hard limit application
- Test deviation detection

#### Initial Calibration
- Test on 30-50 operations
- Measure LLM vs backend score accuracy
- Identify systematic biases
- Tune few-shot examples

**Token Budget:**
- System prompt assessment guidance: 800 tokens
- vs exhaustive rubrics in prompt: 2,500+ tokens
- **Savings: 70% token reduction**

### Phase 2: Core Infrastructure (12-15 hours)
- Risk limits configuration module
- Multi-factor engagement logic
- 5 engagement tools:
  - RequestDecision
  - RequestPreference
  - RequestFeedback
  - RequestGuidance
  - RequestApproval
- ReportPhase tool (transparency)
- Backend integration (anthropic.ts + pi backend)
- Hard limits validator
- Assessment storage and retrieval

### Phase 3: UI Components (12-14 hours)
- Autonomy level slider component
- 5 engagement dialog types with freeform input:
  - Decision dialog (options + custom input)
  - Preference dialog (options + custom input)
  - Feedback dialog (quick actions + custom input)
  - Guidance dialog (trade-offs + custom input)
  - Approval dialog (allow/deny + discussion input)
- Freeform input handling (continues conversation)
- Planning phase progress display (always visible)
- Execution progress display (always visible)
- Mode selector refinement
- Real-time slider adjustment
- Autonomy level tooltips/examples

### Phase 4: Plan Mode Refinement (4-6 hours)
- Read-only planning phases
- Plan export functionality
- "Switch to Auto with this plan" feature
- Clear read-only indicators throughout
- Plan comparison (if editing)

### Phase 5: Calibration & Testing (20-28 hours)
**CRITICAL - Determines system quality**

- Rubric refinement (6-8 hours)
  - Test on 50+ real operations
  - Identify systematic biases
  - Adjust base scores and modifiers
  - Add missing file types
- Hard limit tuning (4-6 hours)
  - Test adversarial examples
  - Add limits for missed patterns
  - Validate safety net
- User testing (6-8 hours)
  - 10+ users at different autonomy levels
  - Collect feedback on engagement frequency
  - Measure denial rates
  - Identify annoying prompts
- Edge case handling (4-6 hours)
  - Rapid slider changes
  - Mid-engagement adjustments
  - Conflicting assessments
  - Error conditions

### Phase 6: Polish & Documentation (4-6 hours)
- Comprehensive documentation
- Video demos at different autonomy levels
- Assessment quality dashboards
- Monitoring setup
- Release notes

**Total Estimated: 71-95 hours**

**Breakdown:**
- Assessment Methodology: 19-26 hours (NEW - critical)
- Core Infrastructure: 12-15 hours
- UI Components: 12-14 hours (increased for freeform input)
- Plan Mode: 4-6 hours
- Calibration & Testing: 20-28 hours (NEW - critical)
- Polish & Docs: 4-6 hours

**Note:** Assessment methodology and calibration are NEW requirements but absolutely critical for system success. Cannot be skipped or rushed.

---

## Migration Path

### From Current System

**Current mode → New mode:**
- Plan → Plan (same read-only behavior)
- Ask → Auto (30% autonomy - collaborative, asks often)
- Auto → Auto (70% autonomy - independent, rarely asks)

**User communication:**
```
🎉 New: Intelligent Autonomy Control!

We've redesigned how you collaborate with the agent:

Plan Mode: Same as before - read-only exploration

Auto Mode: Now adapts to YOUR collaboration preference!

Adjust the slider (0-100%) to control how often
the agent engages you:
  • Decisions (which approach?)
  • Preferences (structure choices)
  • Feedback (validate work)
  • Guidance (trade-off priorities)
  • Approval (risky operations)

Lower = More collaboration
Higher = More independent

The agent ALWAYS shows its planning and execution,
so you're never in the dark. The slider only controls
how often it pauses to involve you.

Default: 50% (balanced collaboration)
```

**Default for new users:** Auto mode, 50% autonomy

---

## Success Metrics

### Quantitative
- User autonomy level distribution (hypothesis: most 40-70%)
- Engagement frequency per autonomy level
- Types of engagement used (Decision vs Preference vs Approval)
- User satisfaction with transparency
- Slider adjustment frequency (finding sweet spot)
- Task completion speed vs autonomy level
- Denial rate per engagement type

### Qualitative
- Users understand what slider controls
- Users appreciate always-visible progress
- Users feel right level of collaboration
- Trust builds through observation
- No catastrophic operations
- Clear distinction between engagement types
- Educational value maintained at high autonomy

---

## Future Considerations

### Adaptive Autonomy (v2)
```
Agent observes patterns:
- User approves all decisions → "Raise autonomy to 70%?"
- User denies/changes decisions → "Lower to 40%?"
- User never engages in feedback → "Disable feedback requests?"
```

### Context-Aware Autonomy (v2)
```
Automatically adjust based on:
- Operation type (deployment = lower autonomy)
- Time of day (tired = lower autonomy)
- Project context (prod vs dev)
- File criticality (core vs experimental)
```

### Engagement Type Toggle (v2)
```
Allow users to disable specific engagement types:
☑ Decisions
☑ Preferences
☑ Feedback
☑ Guidance  
☑ Approval (cannot disable)

Or set per-type autonomy thresholds
```

### Learning Preferences (v2)
```
Agent learns your preferences over time:
- "User always chooses readability over performance"
- "User prefers flat directory structures"
- "User likes detailed explanations"

Applies learnings while still respecting autonomy level
```

### Project-Specific Autonomy (v2)
```
Save different levels per project:
Personal projects: 80% autonomy
Work projects: 50% autonomy
Open source: 30% autonomy (more cautious)
```

---

## Open Questions

1. **UI terminology:**
   - "Autonomy Level" vs "Collaboration Level" vs "Independence Level"?
   - Recommendation: "Autonomy" (clear, industry-standard)

2. **Default autonomy for new users:**
   - 50% (balanced)?
   - 40% (slightly more collaborative)?
   - Let user choose on first use?

3. **Slider granularity:**
   - 1% increments (100 positions)?
   - 5% increments (20 positions)?
   - Recommendation: 1% (fine control), display rounded

4. **Quick-set buttons:**
   ```
   [Collaborative] [──o──] [Independent]
        30%         50%        70%
   ```
   - Helpful for new users?
   - Or keeps UI minimal with just slider?

5. **Show current autonomy during execution:**
   - "Working at 60% autonomy..."
   - Or keep it contextual, only in settings?

6. **Per-engagement-type thresholds:**
   - Allow advanced users to set: "Ask decisions at 40% but approvals at 70%"
   - Or keep simple: one slider for all?

7. **Autonomy affects LLM model selection?**
   - Low autonomy = more capable model (better at explaining options)?
   - High autonomy = faster model (fewer engagements)?

---

## Conclusion

This design represents a fundamental rethinking of human-AI collaboration:

### The Core Insight

**Transparency and Autonomy are orthogonal:**

```
Transparency: CONSTANT
  → Always show planning and execution
  → Never hide agent's work
  → User always understands what's happening
  
Autonomy: VARIABLE
  → How often agent pauses for human input
  → Includes all types of engagement (not just approval)
  → User controls collaboration frequency
```

### The Key Innovation

**Human-in-the-Loop is not just about approval gates.**

It's about **collaborative decision-making** across multiple dimensions:
- Decisions (which approach?)
- Preferences (subjective choices)
- Feedback (validate work)
- Guidance (resolve trade-offs)
- Approval (risk mitigation)

The slider controls **all of these**, not just the last one.

### Why This Works

1. **Always Transparent** - Never a black box, even at 99% autonomy
2. **User-Centered** - One control for collaboration preference
3. **Intelligent** - LLM assesses when to engage across all dimensions
4. **Safe** - Hard limits protect against catastrophic errors
5. **Educational** - Learn by watching, even when not participating
6. **Trust-Building** - Observe good decisions → naturally raise autonomy
7. **Flexible** - Adjust anytime, mid-conversation
8. **Minimalist** - Maximum capability, minimal complexity

**This is human-AI collaboration done right: full transparency, configurable autonomy, intelligent engagement.**
