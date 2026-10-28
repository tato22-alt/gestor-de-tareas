# Gestor de tareas: asistente por Telegram

Asistente por Telegram al que papá le habla como a una secretaria. Proyecto llevado con SDD (spec-driven development). Fase actual: implement.

- [Constitución](docs/constitucion.md): los principios que nada puede contradecir.
- [Spec](docs/spec.md): qué hace y por qué.
- [Plan](docs/plan.md): stack y arquitectura de P1.
- [Tareas](docs/tasks.md): P1 dividido en tareas chicas, con su estado.

## Desarrollo

Necesita Node 22.

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

Las pruebas corren el Worker y una base D1 local con Miniflare: no hace falta ninguna cuenta.
