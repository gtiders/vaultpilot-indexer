# Skill Examples

## Example 1: New Kubernetes Article

### Input

**Article:**
```
Title: "Istio Service Mesh Deep Dive"
Content: "Istio is a comprehensive service mesh platform that provides traffic management, security, and observability for microservices. This article covers architecture, sidecar injection, traffic routing, mTLS, and monitoring..."
Proposed Tags: ["kubernetes", "service-mesh"]
```

**Vault Index Snippet:**
```json
{"note_id": "infrastructure/kubernetes-overview.md", "title": "Kubernetes Overview", "tags": ["kubernetes", "infrastructure", "container-orchestration"], "summary": "Introduction to Kubernetes architecture and core concepts", "folder": "infrastructure/kubernetes"}
{"note_id": "architecture/microservices-patterns.md", "title": "Microservices Design Patterns", "tags": ["microservices", "architecture", "patterns"], "summary": "Common patterns for building distributed microservices", "folder": "architecture"}
{"note_id": "infrastructure/docker-basics.md", "title": "Docker Fundamentals", "tags": ["docker", "containerization"], "summary": "Core Docker concepts and container basics", "folder": "infrastructure/docker"}
{"note_id": "monitoring/prometheus-setup.md", "title": "Prometheus Monitoring Setup", "tags": ["monitoring", "prometheus", "observability"], "summary": "Setting up Prometheus for metrics collection", "folder": "monitoring"}
```

**Intent:**
```json
{
  "topic_area": "infrastructure",
  "avoid_folders": ["archive"]
}
```

### Expected Output

```json
{
  "folder": "infrastructure/kubernetes",
  "tags": ["kubernetes", "service-mesh", "istio", "microservices", "infrastructure"],
  "references": [
    {
      "note_id": "infrastructure/kubernetes-overview.md",
      "reason": "Parent topic providing Kubernetes architecture context",
      "link_text": "Kubernetes architecture"
    },
    {
      "note_id": "architecture/microservices-patterns.md",
      "reason": "Service mesh implements microservices communication patterns",
      "link_text": "microservices patterns"
    }
  ],
  "rationale": "This article extends the Kubernetes infrastructure section with service mesh specifics. It naturally follows the Kubernetes overview and relates to microservices architecture. Tags combine proposed tags with existing vault taxonomy."
}
```

---

## Example 2: Development Tutorial

### Input

**Article:**
```
Title: "React Hooks Patterns"
Content: "Advanced patterns for React hooks including custom hooks, useEffect dependencies, performance optimization with useMemo and useCallback, and state management patterns..."
Proposed Tags: ["react", "javascript"]
```

**Vault Index Snippet:**
```json
{"note_id": "frontend/react-basics.md", "title": "React Fundamentals", "tags": ["react", "frontend", "javascript"], "summary": "Core React concepts and JSX syntax", "folder": "frontend/react"}
{"note_id": "frontend/state-management.md", "title": "State Management Comparison", "tags": ["react", "state-management", "redux"], "summary": "Comparing Redux, MobX, and Context API", "folder": "frontend"}
{"note_id": "javascript/es6-features.md", "title": "ES6+ Features", "tags": ["javascript", "es6"], "summary": "Modern JavaScript syntax and features", "folder": "javascript"}
{"note_id": "architecture/component-design.md", "title": "Component Design Patterns", "tags": ["architecture", "components", "patterns"], "summary": "Design patterns for UI components", "folder": "architecture"}
```

**Intent:**
```json
{
  "related_to": ["frontend/react-basics.md"]
}
```

### Expected Output

```json
{
  "folder": "frontend/react",
  "tags": ["react", "hooks", "javascript", "frontend", "performance"],
  "references": [
    {
      "note_id": "frontend/react-basics.md",
      "reason": "Foundation concepts that hooks build upon",
      "link_text": "React fundamentals"
    },
    {
      "note_id": "frontend/state-management.md",
      "reason": "Hooks are commonly used for state management",
      "link_text": "state management approaches"
    }
  ],
  "rationale": "React hooks content fits naturally in the React frontend section. It builds on the fundamentals and relates to state management patterns. References connect to foundational and related concepts."
}
```

---

## Example 3: Documentation/Guide Article

### Input

**Article:**
```
Title: "Team Onboarding Checklist"
Content": "Step-by-step checklist for onboarding new team members including environment setup, access provisioning, codebase orientation, documentation review, and first task assignments..."
Proposed Tags: ["team", "onboarding"]
```

**Vault Index Snippet:**
```json
{"note_id": "team/coding-standards.md", "title": "Coding Standards", "tags": ["team", "standards", "guidelines"], "summary": "Team coding standards and best practices", "folder": "team"}
{"note_id": "team/meeting-notes.md", "title": "Meeting Notes Template", "tags": ["team", "meetings", "templates"], "summary": "Template for team meeting notes", "folder": "team"}
{"note_id": "process/deployment-guide.md", "title": "Deployment Process", "tags": ["process", "deployment", "devops"], "summary": "Steps for deploying to production", "folder": "process"}
{"note_id": "project/project-alpha.md", "title": "Project Alpha Overview", "tags": ["project", "alpha"], "summary": "Overview of Project Alpha architecture", "folder": "projects"}
```

**Intent:**
```json
{
  "topic_area": "team"
}
```

### Expected Output

```json
{
  "folder": "team",
  "tags": ["team", "onboarding", "process", "documentation"],
  "references": [
    {
      "note_id": "team/coding-standards.md",
      "reason": "New team members need to learn coding standards",
      "link_text": "coding standards"
    },
    {
      "note_id": "process/deployment-guide.md",
      "reason": "Understanding deployment process is part of onboarding",
      "link_text": "deployment process"
    }
  ],
  "rationale": "Onboarding checklist belongs with team documentation. It supports new member integration and references key resources they'll need. Tags capture team process and documentation nature."
}
```

---

## Example 4: Edge Case - No Strong Matches

### Input

**Article:**
```
Title: "Quantum Computing Basics"
Content: "Introduction to quantum computing concepts including qubits, superposition, entanglement, and quantum algorithms..."
Proposed Tags: ["quantum", "computing"]
```

**Vault Index Snippet:**
```json
{"note_id": "python/data-processing.md", "title": "Python Data Processing", "tags": ["python", "data"], "summary": "Processing data with Python", "folder": "python"}
{"note_id": "web/api-design.md", "title": "REST API Design", "tags": ["api", "web", "rest"], "summary": "Best practices for REST API design", "folder": "web"}
{"note_id": "database/postgresql.md", "title": "PostgreSQL Guide", "tags": ["database", "postgresql"], "summary": "PostgreSQL fundamentals and queries", "folder": "database"}
```

**Intent:**
```json
{}
```

### Expected Output

```json
{
  "folder": "research",
  "tags": ["quantum", "computing", "research"],
  "references": [],
  "rationale": "No strong matches found in current vault index. Suggest creating a new 'research' category for emerging topics. Consider running full vault index if this topic should have related content."
}
```

---

## Validation Notes

All examples should:
1. Include all required fields (folder, tags, references, rationale)
2. Use note_id values that exist in the JSONL snippet
3. Provide meaningful reasons for references
4. Keep rationale concise but informative
5. Never suggest automatic file operations
