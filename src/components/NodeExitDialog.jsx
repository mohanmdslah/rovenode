import { useEffect, useRef } from "react";
import { SignOut, X } from "@phosphor-icons/react";

export function NodeExitDialog({ open, copy, onCancel, onConfirm, disabled }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog ref={dialog} className="node-exit-dialog" aria-labelledby="node-exit-title" aria-describedby="node-exit-warning" onCancel={onCancel} onClose={onCancel}>
      <h3 id="node-exit-title">{copy.exitTitle}</h3>
      <p id="node-exit-warning">{copy.exitWarning}</p>
      <div className="node-exit-buttons">
        <button type="button" onClick={onCancel} autoFocus><X size={17} aria-hidden="true" />{copy.cancel}</button>
        <button type="button" className="node-exit-confirm" onClick={onConfirm} disabled={disabled}><SignOut size={18} aria-hidden="true" />{copy.confirmExit}</button>
      </div>
    </dialog>
  );
}
