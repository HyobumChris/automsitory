import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Validate a flow definition at dev time.
 * Returns an array of error strings (empty = valid).
 */
export function validateFlow(flow, label = "flow") {
  const { root, nodes } = flow ?? {};
  const errors = [];

  if (!root || !nodes?.[root]) errors.push(`[${label}] root "${root}" not found in nodes.`);

  for (const [id, n] of Object.entries(nodes || {})) {
    const refs = [];
    if (n.type === "question") {
      if (!n.yes) errors.push(`[${label}] question "${id}" missing "yes".`);
      if (!n.no) errors.push(`[${label}] question "${id}" missing "no".`);
      refs.push(n.yes, n.no);
    } else {
      if (n.next) refs.push(n.next);
    }
    for (const ref of refs.filter(Boolean)) {
      if (!nodes?.[ref]) errors.push(`[${label}] node "${id}" points to missing node "${ref}".`);
    }
  }

  if (errors.length) {
    console.warn(errors.join("\n"));
  }
  return errors;
}

/**
 * Generic flow-engine hook.
 * @param {{ root: string, nodes: Record<string, object> }} flow
 */
export function useFlowEngine(flow) {
  const { root, nodes } = flow;

  const [path, setPath] = useState([root]);
  const [transitions, setTransitions] = useState([]); // {from, to, choice}

  // Reset when root changes (e.g. grade switch)
  useEffect(() => {
    setPath([root]);
    setTransitions([]);
  }, [root]);

  const activeNodeId = path[path.length - 1];
  const activeNode = nodes[activeNodeId];

  const canUndo = path.length > 1;

  const reset = useCallback(() => {
    setPath([root]);
    setTransitions([]);
  }, [root]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    setPath((p) => p.slice(0, -1));
    setTransitions((t) => t.slice(0, -1));
  }, [canUndo]);

  const goTo = useCallback(
    (nextId, choiceLabel = "next") => {
      if (!nextId || !nodes[nextId]) {
        console.warn(`Invalid transition: "${activeNodeId}" -> "${nextId}"`);
        return;
      }
      setPath((p) => [...p, nextId]);
      setTransitions((t) => [...t, { from: activeNodeId, to: nextId, choice: choiceLabel }]);
    },
    [nodes, activeNodeId]
  );

  const goYes = useCallback(() => goTo(activeNode?.yes, "yes"), [goTo, activeNode]);
  const goNo = useCallback(() => goTo(activeNode?.no, "no"), [goTo, activeNode]);
  const goNext = useCallback(() => goTo(activeNode?.next, "next"), [goTo, activeNode]);

  const breadcrumb = useMemo(() => transitions, [transitions]);

  return { path, transitions, breadcrumb, activeNodeId, activeNode, canUndo, reset, undo, goYes, goNo, goNext, goTo };
}
