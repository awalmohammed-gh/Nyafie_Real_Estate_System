import mongoose from "mongoose";
import User from "../models/User.js";
import Property from "../models/Property.js";
import { siteName } from "../models/Setting.js";
import { ownerFilter } from "./ownership.js";
import { choice, fullNameMatch, pageOf, pageResult, searchPattern } from "./listPage.js";

const DAY = 24 * 60 * 60 * 1000;
const OPTIONS = 200; // properties and owners offered in a filter
const MATCHES = 500; // people or listings a search may match

const objectId = (value) => (typeof value === "string" && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null);

// ?range=7|30|90 -> received in the last so many days
export const rangeFilter = (value) => (["7", "30", "90"].includes(value) ? { createdAt: { $gte: new Date(Date.now() - Number(value) * DAY) } } : {});

// The listings these records are about, for a filter ({ id, title }); `selected` is always among them
export const propertyOptions = async (Model, filter, selected) => {
  const ids = await Model.distinct("property", filter);
  const found = await Property.find({ _id: { $in: ids } }).select("title").sort({ title: 1 }).limit(OPTIONS).lean();
  if (selected && !found.some((property) => String(property._id) === String(selected))) {
    const missing = await Property.findById(selected).select("title").lean();
    if (missing) found.unshift(missing);
  }
  return found.map((property) => ({ id: String(property._id), title: property.title }));
};

// Whose listings these records are about, for the admin's owner filter
const ownerOptions = async (Model, filter) => {
  const [agents, platform] = await Promise.all([Model.distinct("owner", { ...filter, ownerType: "agent" }), Model.exists({ ...filter, ownerType: "admin" })]);
  const users = await User.find({ _id: { $in: agents } }).select("firstName lastName").sort({ firstName: 1, lastName: 1 }).limit(OPTIONS).lean();
  return [
    ...(platform ? [{ id: "admin", name: siteName(), type: "admin" }] : []),
    ...users.map((user) => ({ id: String(user._id), name: `${user.firstName} ${user.lastName}`, type: "agent" })),
  ];
};

/**
 * One page of the records on the owner side's board (offers, rentals, sale requests, viewings): agents see
 * their own or agency listings', admins all of them. The database filters, searches, counts and cuts.
 *   ?page, limit, tab, owner (admins), property, range, search
 *   tabs:   { id: filter } ("all"-like ones are {}), counted for the owner/property/range chosen
 *   tab:    the tab when none is asked for; a function of the counts picks one ("auto")
 *   stats:  { name: filter }, counted over everything of theirs
 *   fields: the record's own text fields a search looks in (customer names and listing titles always are)
 *   scope:  (query) => extra filters; sort: (tab) => sort; load: (query) => presented records
 */
export const ownerPage = async (req, { Model, tabs, tab: fallback, stats = {}, fields = [], scope = () => ({}), sort = () => ({ createdAt: -1, _id: -1 }), load, extra }) => {
  const { query } = req;
  const paging = pageOf(query), pattern = searchPattern(query.search);
  const mine = ownerFilter(req.user);
  const isAdmin = req.user.role === "admin";
  const property = objectId(query.property), owner = isAdmin ? objectId(query.owner) : null;
  const scoped = {
    $and: [
      mine,
      property ? { property } : {},
      owner ? { owner, ownerType: "agent" } : isAdmin && query.owner === "admin" ? { ownerType: "admin" } : {},
      rangeFilter(query.range),
      scope(query),
    ],
  };
  const names = Object.keys(tabs);
  const counted = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await Model.countDocuments({ $and: [scoped, tabs[name]] })])));
  const tab = choice(query.tab, names, typeof fallback === "function" ? fallback(counted) : fallback);

  const search = [];
  if (pattern) {
    const [people, listings] = await Promise.all([
      User.find({ $expr: fullNameMatch(pattern) }).select("_id").limit(MATCHES).lean(),
      Property.find({ title: pattern }).select("_id").limit(MATCHES).lean(),
    ]);
    search.push({ $or: [...fields.map((field) => ({ [field]: pattern })), { customer: { $in: people.map((user) => user._id) } }, { property: { $in: listings.map((listing) => listing._id) } }] });
  }
  const filter = { $and: [scoped, tabs[tab], ...search] };
  const [total, items, any, statCounts, properties, owners, more] = await Promise.all([
    pattern ? Model.countDocuments(filter) : counted[tab],
    load(Model.find(filter).sort(sort(tab)).skip(paging.skip).limit(paging.limit)),
    Model.exists(mine),
    Promise.all(Object.values(stats).map((statFilter) => Model.countDocuments({ $and: [mine, statFilter] }))),
    propertyOptions(Model, mine, property),
    isAdmin ? ownerOptions(Model, mine) : [],
    extra ? extra({ mine, property }) : {},
  ]);
  return pageResult(items, total, paging, {
    tab,
    counts: counted,
    stats: Object.fromEntries(Object.keys(stats).map((name, index) => [name, statCounts[index]])),
    options: { properties, owners },
    empty: !any,
    ...more,
  });
};
