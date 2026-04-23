"use client";

import { PreJoin } from "@livekit/components-react";
import "@livekit/components-styles";
import { useRouter } from "next/navigation";

interface RoomLobbyProps {
  roomId: string;
  title?: string;
  onJoin: (options: { audioEnabled: boolean; videoEnabled: boolean }) => void;
}

export function RoomLobby({ roomId, title = "Join Room", onJoin }: RoomLobbyProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 text-white p-4">
      <div className="max-w-2xl w-full p-8 bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700">
        <h1 className="text-2xl font-bold mb-6 text-center">{title}</h1>
        <PreJoin
          defaults={{
            audioEnabled: true,
            videoEnabled: true,
          }}
          onSubmit={(values) => {
            onJoin({
              audioEnabled: values.audioEnabled,
              videoEnabled: values.videoEnabled,
            });
          }}
        />
      </div>
    </div>
  );
}
