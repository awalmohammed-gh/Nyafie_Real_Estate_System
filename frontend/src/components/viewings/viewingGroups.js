// Splits viewings into what needs an answer, what's coming up and the rest, for one side
const OPEN = ["requested", "confirmed"];

export const viewingTabs = (viewings, side, now = Date.now()) => {
  const upcoming = (v) => OPEN.includes(v.statusKey) && new Date(v.scheduledAt).getTime() > now;
  const needsAnswer = (v) => v.statusKey === "requested" && v.awaiting === side;
  // Owners also need to mark viewings whose time has passed
  const toMark = (v) => side === "owner" && v.statusKey === "confirmed" && new Date(v.scheduledAt).getTime() <= now;
  const action = (v) => needsAnswer(v) || toMark(v);
  const byTime = (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt);
  const groups = {
    action: viewings.filter(action).sort(byTime),
    upcoming: viewings.filter((v) => upcoming(v) && !action(v)).sort(byTime),
    past: viewings.filter((v) => !upcoming(v) && !action(v)).sort((a, b) => byTime(b, a)),
  };
  return [
    { id: "action", label: "Needs your answer", count: groups.action.length, items: groups.action },
    { id: "upcoming", label: "Upcoming", count: groups.upcoming.length, items: groups.upcoming },
    { id: "past", label: "Past & closed", count: groups.past.length, items: groups.past },
  ];
};
