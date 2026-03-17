import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";

function token() { return localStorage.getItem("boop_session") ?? ""; }
function authH() { return { Authorization: `Bearer ${token()}` }; }

const MAX_PER_TEAM = 5;

type SignupPlayer = {
  id: string;
  user_id: string;
  username: string;
  character_name: string | null;
  bdo_class: string | null;
  ap: number | null;
  aap: number | null;
  dp: number | null;
  note: string | null;
};

type TeamMember = {
  signup_id: string;
  username: string;
  character_name: string | null;
  bdo_class: string | null;
  ap: number | null;
  aap: number | null;
  dp: number | null;
};

export type ShrineTeam = {
  id: string;
  name: string;
  members: TeamMember[];
};

// ── Player pill ───────────────────────────────────────────────────────────────

function Pill({
  signup,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  signup: SignupPlayer;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const name = signup.character_name ?? signup.username;
  const gear = [signup.ap, signup.aap, signup.dp].map(v => v ?? "—").join("/");
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 cursor-grab active:cursor-grabbing select-none transition-opacity ${
        isDragging ? "opacity-30" : "hover:border-slate-600"
      }`}
    >
      <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-black text-slate-300 shrink-0">
        {name[0].toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-white truncate leading-tight">{name}</p>
        {signup.bdo_class && (
          <p className="text-[10px] text-violet-400 leading-tight">{signup.bdo_class}</p>
        )}
      </div>
      <span className="text-[9px] text-slate-500 font-mono shrink-0">{gear}</span>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export default function ShrineSection() {
  const user = useAuth();

  const [signups, setSignups]       = useState<SignupPlayer[]>([]);
  const [teams, setTeams]           = useState<ShrineTeam[]>([]);
  const [loading, setLoading]       = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal]   = useState("");
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/shrine", { headers: authH() }).then(r => r.json()),
      fetch("/api/shrine/teams", { headers: authH() }).then(r => r.json()),
    ]).then(([sups, tms]) => {
      setSignups(Array.isArray(sups) ? sups : []);
      setTeams(Array.isArray(tms) ? tms : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function refreshTeams() {
    const tms = await fetch("/api/shrine/teams", { headers: authH() }).then(r => r.json());
    setTeams(Array.isArray(tms) ? tms : []);
  }

  const assignedIds = new Set(teams.flatMap(t => t.members.map(m => m.signup_id)));
  const unassigned  = signups.filter(s => !assignedIds.has(s.id));

  async function assign(signupId: string, teamId: string | null) {
    await fetch("/api/shrine/teams/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authH() },
      body: JSON.stringify({ signup_id: signupId, team_id: teamId }),
    });
    await refreshTeams();
  }

  function handleDrop(teamId: string | null) {
    if (!draggingId) return;
    if (teamId) {
      const team = teams.find(t => t.id === teamId);
      const alreadyIn = team?.members.some(m => m.signup_id === draggingId);
      if (team && !alreadyIn && team.members.length >= MAX_PER_TEAM) {
        setDraggingId(null);
        setDragOverId(null);
        return;
      }
    }
    assign(draggingId, teamId);
    setDraggingId(null);
    setDragOverId(null);
  }

  async function createTeam() {
    setSaving(true);
    const res = await fetch("/api/shrine/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authH() },
      body: JSON.stringify({ name: `Team ${teams.length + 1}` }),
    });
    if (res.ok) {
      const team = await res.json();
      setTeams(prev => [...prev, { ...team, members: [] }]);
    }
    setSaving(false);
  }

  async function deleteTeam(id: string) {
    await fetch(`/api/shrine/teams/${id}`, { method: "DELETE", headers: authH() });
    setTeams(prev => prev.filter(t => t.id !== id));
  }

  function startRename(team: ShrineTeam) {
    setRenamingId(team.id);
    setRenameVal(team.name);
  }

  async function saveRename() {
    if (!renamingId || !renameVal.trim()) { setRenamingId(null); return; }
    await fetch(`/api/shrine/teams/${renamingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authH() },
      body: JSON.stringify({ name: renameVal.trim() }),
    });
    setTeams(prev => prev.map(t => t.id === renamingId ? { ...t, name: renameVal.trim() } : t));
    setRenamingId(null);
  }

  // Sync profile gear changes into local state so pills update without a reload
  useEffect(() => {
    if (!user || !signups.length) return;
    setSignups(prev => prev.map(s =>
      s.user_id === user.id
        ? { ...s, bdo_class: user.bdo_class, ap: user.gear_ap, aap: user.gear_aap, dp: user.gear_dp }
        : s
    ));
    setTeams(prev => prev.map(t => ({
      ...t,
      members: t.members.map(m =>
        m.username === user.username
          ? { ...m, bdo_class: user.bdo_class, ap: user.gear_ap, aap: user.gear_aap, dp: user.gear_dp }
          : m
      ),
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.bdo_class, user?.gear_ap, user?.gear_aap, user?.gear_dp, signups.length]);

  if (loading) return <p className="text-slate-500 text-center py-16">Loading…</p>;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black text-white">Black Shrine</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Drag players into teams. Max {MAX_PER_TEAM} per team.
            {signups.length > 0 && <span className="ml-2 text-slate-600">{signups.length} signed up · {unassigned.length} unassigned</span>}
          </p>
        </div>
        <button onClick={createTeam} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white transition-colors">
          {saving ? "…" : "+ New Team"}
        </button>
      </div>

      <div className="flex gap-5 items-start">

        {/* ── Left: unassigned pool ── */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOverId("unassigned"); }}
          onDragLeave={() => { if (dragOverId === "unassigned") setDragOverId(null); }}
          onDrop={() => handleDrop(null)}
          className={`w-52 shrink-0 border rounded-xl p-3 transition-colors ${
            dragOverId === "unassigned" && draggingId
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-slate-800 bg-slate-900/40"
          }`}
        >
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
            Unassigned <span className="text-slate-700">({unassigned.length})</span>
          </p>
          {signups.length === 0 ? (
            <p className="text-slate-700 text-xs text-center py-8">No sign-ups yet</p>
          ) : unassigned.length === 0 ? (
            <p className="text-slate-700 text-xs text-center py-8">All assigned</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {unassigned.map(s => (
                <Pill key={s.id} signup={s} isDragging={draggingId === s.id}
                  onDragStart={() => setDraggingId(s.id)}
                  onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Right: team buckets ── */}
        <div className="flex-1 min-w-0">
          {teams.length === 0 ? (
            <div className="border border-dashed border-slate-800 rounded-xl text-center py-14">
              <p className="text-3xl mb-2">⛩️</p>
              <p className="text-slate-600 text-sm">No teams yet. Click "+ New Team" to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {teams.map(team => {
                const isFull     = team.members.length >= MAX_PER_TEAM;
                const isOver     = dragOverId === team.id && !!draggingId;
                const alreadyIn  = team.members.some(m => m.signup_id === draggingId);
                const canDrop    = isOver && !alreadyIn && !isFull;
                const blocked    = isOver && !alreadyIn && isFull;

                return (
                  <div key={team.id}
                    onDragOver={e => { e.preventDefault(); setDragOverId(team.id); }}
                    onDragLeave={() => { if (dragOverId === team.id) setDragOverId(null); }}
                    onDrop={() => handleDrop(team.id)}
                    className={`border rounded-xl p-3 min-h-[160px] transition-colors ${
                      canDrop  ? "border-violet-500/60 bg-violet-500/5" :
                      blocked  ? "border-red-500/40 bg-red-500/5" :
                      "border-slate-700/50 bg-slate-900/40"
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="flex-1 min-w-0">
                        {renamingId === team.id ? (
                          <input autoFocus value={renameVal}
                            onChange={e => setRenameVal(e.target.value)}
                            onBlur={saveRename}
                            onKeyDown={e => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenamingId(null); }}
                            className="w-full bg-slate-800 border border-violet-500 rounded px-2 py-0.5 text-sm font-bold text-white focus:outline-none"
                          />
                        ) : (
                          <button onClick={() => startRename(team)}
                            className="text-sm font-bold text-white hover:text-violet-300 transition-colors truncate block max-w-full text-left"
                            title="Click to rename">
                            {team.name}
                          </button>
                        )}
                      </div>
                      <span className={`text-[10px] font-black shrink-0 ${isFull ? "text-amber-400" : "text-slate-600"}`}>
                        {team.members.length}/{MAX_PER_TEAM}
                      </span>
                      <button onClick={() => deleteTeam(team.id)}
                        className="text-slate-700 hover:text-red-400 transition-colors text-xs shrink-0 px-0.5">
                        ✕
                      </button>
                    </div>

                    {/* Members */}
                    <div className="flex flex-col gap-1.5">
                      {team.members.map(m => {
                        const signup = signups.find(s => s.id === m.signup_id);
                        if (!signup) return null;
                        return (
                          <Pill key={m.signup_id} signup={signup}
                            isDragging={draggingId === m.signup_id}
                            onDragStart={() => setDraggingId(m.signup_id)}
                            onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                          />
                        );
                      })}
                      {team.members.length === 0 && (
                        <p className="text-slate-700 text-xs text-center py-5">
                          {canDrop ? "Drop here" : "Empty — drag players here"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
