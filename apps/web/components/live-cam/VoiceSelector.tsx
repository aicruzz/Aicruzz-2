'use client';

export type VoiceMode = 'NONE' | 'MALE' | 'FEMALE' | 'AI' | 'CLONE';

const VOICE_OPTIONS: { value: VoiceMode; label: string; icon: string; desc: string }[] = [
  { value: 'NONE',   label: 'Original',     icon: '🎤', desc: 'Your real voice' },
  { value: 'MALE',   label: 'Male',         icon: '👨', desc: 'Deep male voice' },
  { value: 'FEMALE', label: 'Female',       icon: '👩', desc: 'Clear female voice' },
  { value: 'AI',     label: 'AI Voice',     icon: '🤖', desc: 'Synthetic AI voice' },
  { value: 'CLONE',  label: 'Clone',        icon: '🔮', desc: 'Clone any voice' },
];

interface VoiceSelectorProps {
  selected: VoiceMode;
  onChange: (mode: VoiceMode) => void;
  disabled?: boolean;
}

export function VoiceSelector({ selected, onChange, disabled }: VoiceSelectorProps) {
  return (
    <div className="glass rounded-xl border border-white/5 p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Voice Changer
      </h3>
      <div className="grid grid-cols-5 gap-1.5">
        {VOICE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            title={opt.desc}
            className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 transition-all disabled:opacity-40 ${
              selected === opt.value
                ? 'border-brand-500/50 bg-brand-500/15 text-brand-400'
                : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200'
            }`}
          >
            <span className="text-lg leading-none">{opt.icon}</span>
            <span className="text-[10px] font-medium leading-tight text-center">
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
