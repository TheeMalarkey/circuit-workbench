# Tidy selection, local v112

The existing Shift-drag / Shift-click selection now scopes the UI Tidy action. Selected wires and wires touching sockets on selected boards are included. With no selection, the whole circuit remains the scope. A selected board with no connected wires does not accidentally trigger whole-circuit routing.

The captured wire IDs travel to the background worker. Routing and best-effort retries are restricted to those IDs. All boards and all unselected wires remain fixed; contacts outside the selection remain electrical anchors. Selected wires may be rerouted along their entire length, not only the part inside the selection rectangle.

Button label and tooltip reflect selection and restore correctly after temporary completion feedback. Existing Undo, model-change rejection, and background safeguards remain.

Validation: 256 tests pass. New tests cover scope resolution and untouched unselected wires. Browser: selecting the Full Adder changed the button to Tidy selection; invoking it returned Already tidy through the worker. Existing saved user projects at 127.0.0.1 were not edited. No deployment.
