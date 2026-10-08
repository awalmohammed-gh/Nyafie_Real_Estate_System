import { useRef, useState } from "react";
import { Camera, Check, Loader2, Upload } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { compressImage } from "../../utils/image";
import UserAvatar from "./UserAvatar";

const ProfilePhotoEditor = ({ variant = "row" }) => {
  const { user, uploadProfilePhoto, removeProfilePhoto } = useAuth();
  const input = useRef(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || lock.current) return;
    setError("");
    setStatus("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError("Choose a JPG, PNG or WebP photo.");
    if (file.size > 5 * 1024 * 1024) return setError("Choose a photo smaller than 5 MB.");
    lock.current = true;
    setBusy(true);
    setStatus("Preparing your photo...");
    try {
      const image = await compressImage(file, 768, 0.85);
      setPreview(image);
      setStatus("Uploading your photo...");
      await uploadProfilePhoto(image);
      setStatus("Profile photo updated.");
    } catch (uploadError) {
      setError(uploadError.message || "Your photo couldn't be uploaded. Please try again.");
      setStatus("");
    } finally {
      setPreview("");
      setBusy(false);
      lock.current = false;
    }
  };

  const remove = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setStatus("Removing your photo...");
    try {
      await removeProfilePhoto();
      setStatus("Profile photo removed.");
    } catch (removeError) {
      setError(removeError.message || "Your photo couldn't be removed. Please try again.");
      setStatus("");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };

  return (
    <div className={`profile-photo-editor profile-photo-editor--${variant}`}>
      <div className="profile-photo-preview">
        <UserAvatar user={preview ? { ...user, profileImage: preview } : user} label={preview ? "New profile photo preview" : "Your profile photo"} className="profile-photo-avatar" />
        <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={user.profileImage ? "Change profile photo" : "Upload profile photo"} className="profile-photo-camera">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}</button>
      </div>
      <div className="profile-photo-content">
        <p className="text-sm font-semibold text-gray-900">Profile photo</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">JPG, PNG or WebP. Up to 5 MB.</p>
        <div className="profile-photo-actions">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="account-button account-button--secondary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{busy ? "Please wait..." : user.profileImage ? "Change photo" : "Upload photo"}</button>
          {user.profileImage && <button type="button" onClick={remove} disabled={busy} className="account-text-button">Remove</button>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" onChange={upload} disabled={busy} className="hidden" />
        {error && <p role="alert" className="mt-3 text-xs leading-relaxed text-red-700">{error}</p>}
        <p role="status" aria-live="polite" className={`profile-photo-status ${busy ? "text-gray-500" : "text-emerald-700"}`}>{status && <>{!busy && <Check className="h-3.5 w-3.5 shrink-0" />}{status}</>}</p>
      </div>
    </div>
  );
};

export default ProfilePhotoEditor;
