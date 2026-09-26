import Modal from "./Modal";

// Confirmation for destructive or significant actions
const ConfirmDialog = ({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", tone = "danger", children, disabled }) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    size="sm"
    footer={
      <>
        <button onClick={onClose} className="btn btn-light">Cancel</button>
        <button
          onClick={onConfirm}
          disabled={disabled}
          className={`btn ${tone === "danger" ? "bg-red-600 text-white hover:bg-red-700" : "btn-primary"}`}
        >
          {confirmLabel}
        </button>
      </>
    }
  >
    {description && <p className="text-sm text-gray-600">{description}</p>}
    {children && <div className={description ? "mt-4" : ""}>{children}</div>}
  </Modal>
);

export default ConfirmDialog;
