import './pet-panda.css';
import type { PetBaseState, PetReaction } from './usePetSignal';

interface PetPandaProps {
  baseState: PetBaseState;
  isStreaming: boolean;
  reaction: PetReaction;
  reactionNonce: number;
  onClick: () => void;
}

export function PetPanda({ baseState, isStreaming, reaction, reactionNonce, onClick }: PetPandaProps) {
  const className = [
    'pet-panda',
    `state-${baseState}`,
    isStreaming && 'is-streaming',
    reaction === 'tool-error' && 'flinching',
    reaction === 'click' && 'clicking',
    reaction !== null && reaction !== 'tool-error' && reaction !== 'click' && 'reacting',
  ]
    .filter(Boolean)
    .join(' ');

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') onClick();
  };

  return (
    <div
      className={className}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Desktop pet panda"
    >
      <svg viewBox="0 0 72 44">
        <g className="pet-panda-body" key={`body-${reactionNonce}`}>
          <ellipse className="pet-panda-leg-bl fur-dark" cx="22" cy="36" rx="5" ry="7" style={{ transformOrigin: '22px 32px' }} />
          <ellipse className="pet-panda-leg-br fur-dark" cx="50" cy="36" rx="5" ry="7" style={{ transformOrigin: '50px 32px' }} />
          <ellipse className="fur" cx="38" cy="27" rx="22" ry="13" />
          <circle className="pet-panda-tail fur" cx="64" cy="24" r="3" style={{ transformOrigin: '64px 24px' }} />
          <ellipse className="pet-panda-leg-fl fur-dark" cx="16" cy="37" rx="5" ry="8" style={{ transformOrigin: '16px 32px' }} />
          <ellipse className="pet-panda-leg-fr fur-dark" cx="46" cy="37" rx="5" ry="8" style={{ transformOrigin: '46px 32px' }} />
          <g className="pet-panda-head" style={{ transformOrigin: '14px 16px' }} key={`head-${reactionNonce}`}>
            <g className="pet-panda-ears">
              <circle className="fur-dark" cx="5" cy="6" r="5" />
              <circle className="fur-dark" cx="23" cy="6" r="5" />
            </g>
            <circle className="fur" cx="14" cy="16" r="12" />
            <circle className="blush" cx="7" cy="19" r="1.5" />
            <circle className="blush" cx="21" cy="19" r="1.5" />
            <g className="pet-panda-eye" style={{ transformOrigin: '9px 16px' }}>
              <ellipse className="fur-dark" cx="9" cy="16" rx="3.5" ry="5" />
              <circle className="eye-shine" cx="9" cy="17" r="1" />
            </g>
            <g className="pet-panda-eye" style={{ transformOrigin: '19px 16px' }}>
              <ellipse className="fur-dark" cx="19" cy="16" rx="3.5" ry="5" />
              <circle className="eye-shine" cx="19" cy="17" r="1" />
            </g>
            <ellipse className="fur-dark" cx="14" cy="21" rx="1.5" ry="1" />
          </g>
        </g>
      </svg>
    </div>
  );
}
