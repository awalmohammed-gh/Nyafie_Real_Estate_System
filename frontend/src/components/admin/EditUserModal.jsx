import { useState } from "react";
import Modal from "../ui/Modal";
import { useAuth } from "../../context/useAuth";
import { useAsyncAction } from "../../hooks/useAsyncAction";

const EditUserModal = ({ user, onClose, onSaved }) => {
  const { admin } = useAuth();
  const run = useAsyncAction();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone || "" });
  const [error, setError] = useState("");

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("First and last name are required.");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError("Enter a valid email address.");
    setSaving(true);
    const { ok } = await run(
      admin.updateUser(user.id, { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim() }),
      { success: "Account updated", description: `${form.firstName} ${form.lastName}` }
    );
    setSaving(false);
    if (ok) {
      onSaved?.();
      onClose();
    }
  };

  const field = (key, label, type = "text") => (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-gray-700">{label}</span>
      <input type={type} value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} className="field" />
    </label>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${user.role}`}
      description={user.name}
      footer={
        <>
          <button onClick={onClose} className="btn btn-light">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? "Saving..." : "Save changes"}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field("firstName", "First name")}
        {field("lastName", "Last name")}
        {field("email", "Email", "email")}
        {field("phone", "Phone", "tel")}
      </div>
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    </Modal>
  );
};

export default EditUserModal;
