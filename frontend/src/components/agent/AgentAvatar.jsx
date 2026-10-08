import { getInitials } from '../../utils/property';

// Use real names without placeholder portraits or implied verification.
const AgentAvatar = ({ name, image, large = false }) => (
  <span className={`agent-avatar${large ? ' agent-avatar-large' : ''}`} aria-hidden="true">{image ? <img src={image} alt="" className="h-full w-full rounded-[inherit] object-cover" /> : getInitials(name)}</span>
);

export default AgentAvatar;
