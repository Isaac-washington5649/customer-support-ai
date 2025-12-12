import { describe, expect, it } from "vitest";
import { buildExportPayload, formatDate, formatTime } from "./chat";
import type { ChatSession } from "../types/chat";

const mockSession: ChatSession = {
  id: "s-1",
  title: "Support chat",
  mode: "Assist",
  createdAt: new Date("2024-01-01T08:00:00Z").toISOString(),
  updatedAt: new Date("2024-01-01T08:30:00Z").toISOString(),
  messages: [
    {
      id: "m-1",
      role: "user",
      content: "Hello",
      createdAt: new Date("2024-01-01T08:01:00Z").toISOString(),
      state: "idle",
    },
  ],
};

describe("chat helpers", () => {
  it("formats dates and times", () => {
    const date = "2024-01-05T12:00:00Z";
    expect(formatDate(date)).toMatch(/Jan/);
    expect(formatTime(date)).toMatch(/12|01/);
  });

  it("creates readable exports", () => {
    const payload = buildExportPayload(mockSession, "txt");
    expect(payload).toContain("Support chat");
    expect(payload).toContain("User");
  });
});
