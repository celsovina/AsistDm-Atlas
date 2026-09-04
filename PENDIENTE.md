# Pendiente

Funciones evaluadas y aplazadas conscientemente. No son bloqueantes.

## Biblioteca de grimorios del mago

**Estado:** la estructura de datos ya está lista; falta la UI.

El registro del mago en `spellbooks` guarda `grimoires` como una **colección**
(`js/classes/class-spellbook-storage.js`):

```jsonc
grimoires: [
  { id: "default", name: "Grimorio", spellIds: [...] }
]
```

Hoy la UI solo maneja `grimoires[0]`. En 5e (y en mesa) un mago puede tener
**varios grimorios propios** para organizar sus conjuros por tema
(ataque / curación / soporte / rituales…). La preparación siempre trabaja sobre
la **unión** de todos los grimorios (`prepared` ⊆ ∪ `grimoires[*].spellIds`), así
que ese modelo no cambia.

Falta:
- Botón "+ grimorio" y renombrar en la tarjeta del mago de *Conjuros activos*.
- Mover / copiar conjuros entre grimorios.
- Pestañas o selector por grimorio en la sección "Grimorio".
- Al estrellar un conjuro de mago en el catálogo, elegir a qué grimorio va
  (por defecto el activo).

Migración: ninguna. La forma de colección ya está persistida.

## No se hará (a menos que cambie el alcance)

- **Conjuros raciales / de dote automáticos.** Implicaría configurar razas y
  dotes = construir las fichas de personaje. Se cubre a mano con el interruptor
  "Conjuros de otros orígenes". El caso de conjuros/espacios es especial (uso
  constante en mesa, fácil de olvidar) y por eso sí tiene tratamiento propio.
- **Mystic Arcanum del brujo.** Se marca como cualquier otro conjuro de "otros
  orígenes".
- **Varios personajes de la misma clase por jugador.** La clave
  `<slug>_<classId>` es ampliable si algún día hace falta.
- **Recuperar espacios de conjuro desde "Conjuros activos".** Eso lo administra
  solo "Rasgos activos" (descanso o tocar el espacio) — es su razón de ser.
