import Modal from "../ui/Modal";

// Admin records use a centered, scrollable dialog on every screen size.
const AdminRecordModal = ({ size, footer, ...props }) => (
  <Modal
    {...props}
    centered
    size={size === "lg" ? "xl" : "lg"}
    footer={footer && <div className="flex w-full flex-wrap justify-end gap-2">{footer}</div>}
  />
);

export default AdminRecordModal;
