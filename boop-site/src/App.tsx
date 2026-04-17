import "./index.css";
import { useEffect, useState } from "react";

import Nav from "./components/Nav";
import PeepoBackground from "./components/PeepoBackground";
import { useRibbits } from "./hooks/useRibbits";
import { useAuth } from "./lib/auth";

import Home from "./pages/Home";
import ClassRoller from "./pages/ClassRoller";
import Auth from "./pages/Auth";
import Shuffler from "./pages/Shuffler";
import Employee from "./pages/Employee";
import Frogs from "./pages/Frogs";
import WallOfShame from "./pages/WallOfShame";
import CalendarPage from "./pages/CalendarPage";
import Nodewar from "./pages/Nodewar";
import Settings from "./pages/Settings";
import SubmitWall from "./pages/SubmitWall";
import BlackShrine from "./pages/BlackShrine";
import RibbitLeaderboard from "./pages/RibbitLeaderboard";
import GearLeaderboard from "./pages/GearLeaderboard";
import GuildDirectory from "./pages/GuildDirectory";
import PayoutTracker from "./pages/PayoutTracker";
import RandomChooser from "./pages/RandomChooser";
import DiceRoller from "./pages/DiceRoller";
import Quotes from "./pages/Quotes";

type Route = "home" | "class-roller" | "shuffler" | "employee" | "frogs" | "wall" | "submit-wall" | "calendar" | "nodewar" | "shrine" | "auth" | "manage" | "ribbit-leaderboard" | "gear-leaderboard" | "guild-directory" | "payout-tracker" | "random-chooser" | "dice-roller" | "quotes";

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, "").split("/")[0].split("?")[0];
    switch (h) {
    case "class-roller":
      return "class-roller";
    case "auth":
      return "auth";
    case "shuffler":
      return "shuffler";
    case "employee":
      return "employee";
    case "frogs":
      return "frogs";
    case "wall":
      return "wall";
    case "calendar":
      return "calendar";
    case "nodewar":
      return "nodewar";
    case "manage":
    case "settings": // legacy redirect
    case "members":  // legacy redirect
      return "manage";
    case "submit-wall": return "submit-wall";
    case "shrine":             return "shrine";
    case "ribbit-leaderboard": return "ribbit-leaderboard";
    case "gear-leaderboard":   return "gear-leaderboard";
    case "guild-directory":    return "guild-directory";
    case "payout-tracker":     return "payout-tracker";
    case "random-chooser":     return "random-chooser";
    case "dice-roller":        return "dice-roller";
    case "quotes":             return "quotes";
    default:
      return "home";
  }
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash());
  const { count: ribbits } = useRibbits();
  const user = useAuth();

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    // primary listener
    window.addEventListener("hashchange", onHash);
    // defensive listeners: some environments may not reliably fire hashchange
    window.addEventListener("popstate", onHash);
    window.addEventListener("click", onHash);
    // sync immediately in case hash changed before mount
    onHash();

    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
      window.removeEventListener("click", onHash);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-foreground antialiased">
      <PeepoBackground />
      <Nav route={route} />

      {/* Easter egg ribbit counter — bottom-right corner, all pages */}
      {ribbits > 0 && (
        <a
          href="#/frogs"
          title="ribbit"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/50 backdrop-blur text-xs font-bold text-slate-400 hover:text-green-400 hover:border-green-700/50 transition-colors select-none"
        >
          🐸 <span>{ribbits}</span>
        </a>
      )}

      <main className="pt-14">
        {route === "home" && <Home />}
        {route === "class-roller" && <ClassRoller />}
        {route === "auth" && <Auth />}
        {route === "shuffler" && <Shuffler />}
        {route === "employee" && <Employee />}
        {route === "frogs" && <Frogs />}
        {route === "wall" && <WallOfShame />}
        {route === "calendar" && <CalendarPage />}
        {route === "nodewar" && <Nodewar />}
        {route === "manage"      && <Settings />}
        {route === "submit-wall" && <SubmitWall />}
        {route === "shrine"             && <BlackShrine key={user?.id ?? "guest"} />}
        {route === "ribbit-leaderboard" && <RibbitLeaderboard />}
        {route === "gear-leaderboard"   && <GearLeaderboard />}
        {route === "guild-directory"    && <GuildDirectory />}
        {route === "payout-tracker"     && <PayoutTracker />}
        {route === "random-chooser"     && <RandomChooser />}
        {route === "dice-roller"        && <DiceRoller />}
        {route === "quotes"             && <Quotes />}
      </main>
    </div>
  );
}

export default App;
