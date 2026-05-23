'use client';

import { Camera, CameraOff, Mic, MicOff, Video, Square, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface SessionControlsProps {
  isLive: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  isRecording: boolean;
  hasRecording: boolean;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onDownloadRecording: () => void;
  loading?: boolean;
}

export function SessionControls({
  isLive,
  isMuted,
  isCameraOn,
  isRecording,
  hasRecording,
  onStart,
  onStop,
  onToggleMute,
  onToggleCamera,
  onStartRecording,
  onStopRecording,
  onDownloadRecording,
  loading,
}: SessionControlsProps) {
  return (
    <div className="glass rounded-xl border border-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Start / Stop */}
        {isLive ? (
          <Button
            variant="danger"
            size="md"
            onClick={onStop}
            icon={<Square className="h-4 w-4" />}
          >
            End Session
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            loading={loading}
            onClick={onStart}
            icon={<Video className="h-4 w-4" />}
          >
            Go Live
          </Button>
        )}

        {/* Camera + Mic controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCamera}
            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
              isCameraOn
                ? 'border-white/10 bg-surface-700 text-gray-300 hover:bg-surface-600'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
            }`}
            title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {isCameraOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
          </button>

          <button
            onClick={onToggleMute}
            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
              !isMuted
                ? 'border-white/10 bg-surface-700 text-gray-300 hover:bg-surface-600'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        </div>

        {/* Recording controls */}
        <div className="flex items-center gap-2">
          {isLive && (
            isRecording ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onStopRecording}
                icon={<Square className="h-3.5 w-3.5 text-red-400" />}
              >
                Stop Rec
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={onStartRecording}
                icon={<div className="h-3 w-3 rounded-full bg-red-500" />}
              >
                Record
              </Button>
            )
          )}

          {hasRecording && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onDownloadRecording}
              icon={<Download className="h-3.5 w-3.5" />}
            >
              Download
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
