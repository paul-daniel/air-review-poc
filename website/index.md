---
layout: home

hero:
  name: air-review
  text: Contextual AI code review for your pull requests
  tagline: A command-line tool that reads a change the way a senior colleague would, checks its findings against the code, and remembers what it already reviewed. Runs on GitHub and Azure DevOps with any OpenAI-compatible model API.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Integrate in your pipeline
      link: /integrations/microsoft-foundry

features:
  - icon: 🔍
    title: Contextual, not just a diff
    details: Before any model call, the planner selects existing files of the same kind, the exported API of imported modules and a one-paragraph repository profile. The model sees how your repository already does things.
  - icon: ✅
    title: Verified before it is published
    details: Deterministic rules handle what software can decide exactly. A second, cheaper model call re-checks each finding against the real code and drops what it cannot prove. Exit code 10 gates the merge.
  - icon: 🔁
    title: Incremental, with memory in the pull request
    details: Review state lives in PR comments or threads, never on a server. Follow-up pushes are incremental, findings keep their identity when code moves, and nothing is reviewed twice.
---
