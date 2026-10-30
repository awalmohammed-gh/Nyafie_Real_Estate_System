// In-memory stand-ins for Mongoose model methods, for tests that need several collections to
// change together (no database). Supports the filters and updates the app uses: equality on
// dotted paths (arrays match any element), $in, $ne, $exists, $gt, $or, and $set/$unset/$push/$pull.
import mongoose from "mongoose";

const isOperatorObject = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof mongoose.Types.ObjectId) &&
  !(value instanceof Date) &&
  Object.keys(value).some((key) => key.startsWith("$"));
const key = (value) =>
  value instanceof Date
    ? value.getTime()
    : value && typeof value === "object" && "_id" in value
      ? String(value._id)
      : value === undefined
        ? undefined
        : value === null
          ? null
          : String(value);
const plain = (doc) =>
  doc?.toObject ? doc.toObject({ depopulate: true }) : doc;

// Every value at a dotted path (arrays along the way are flattened, as MongoDB does)
const valuesAt = (obj, path) =>
  path
    .split(".")
    .reduce(
      (values, part) =>
        values.flatMap((value) => {
          if (Array.isArray(value)) return value.map((item) => item?.[part]);
          return [value?.[part]];
        }),
      [obj],
    )
    .flatMap((value) => (Array.isArray(value) ? [value, ...value] : [value]));

const same = (value, expected) =>
  expected === null
    ? value === null || value === undefined
    : key(value) === key(expected);
const test = (values, condition) => {
  if (!isOperatorObject(condition))
    return values.some((value) => same(value, condition));
  return Object.entries(condition).every(([op, arg]) => {
    if (op === "$in")
      return values.some((value) => arg.some((item) => same(value, item)));
    if (op === "$ne") return !values.some((value) => same(value, arg));
    if (op === "$exists")
      return arg
        ? values.some((value) => value !== undefined)
        : values.every((value) => value === undefined);
    if (op === "$gt")
      return values.some((value) => value != null && value > arg);
    throw new Error(`memoryModels: unsupported operator ${op}`);
  });
};
export const matches = (doc, filter = {}) => {
  const obj = plain(doc);
  return Object.entries(filter).every(([path, condition]) =>
    path === "$or"
      ? condition.some((part) => matches(doc, part))
      : test(valuesAt(obj, path), condition),
  );
};

const apply = (doc, update) => {
  for (const [op, fields] of Object.entries(update)) {
    for (const [path, value] of Object.entries(fields)) {
      if (op === "$set") doc.set(path, value);
      else if (op === "$unset") doc.set(path, undefined);
      else if (op === "$push") doc.set(path, [...(doc.get(path) || []), value]);
      else if (op === "$pull")
        doc.set(
          path,
          (doc.get(path) || []).filter(
            (item) => !value.$in.some((other) => same(item, other)),
          ),
        );
      else throw new Error(`memoryModels: unsupported update ${op}`);
    }
  }
};

// A chainable, awaitable query result
export const q = (value) => {
  const promise = Promise.resolve(value);
  const self = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    select: () => self,
    populate: () => self,
    sort: () => self,
    limit: () => self,
    skip: () => self,
    lean: () => self,
  };
  return self;
};

/** Replaces Model's query methods with ones backed by `docs` (Mongoose documents). Returns the store. */
export const memoryModel = (t, Model, docs = []) => {
  const store = {
    docs,
    Model,
    add: (fields) => {
      const doc = fields instanceof Model ? fields : new Model(fields);
      t.mock.method(doc, "save", async () => doc);
      docs.push(doc);
      return doc;
    },
  };
  docs.forEach((doc) => t.mock.method(doc, "save", async () => doc));
  const all = (filter) => docs.filter((doc) => matches(doc, filter));
  t.mock.method(Model, "find", (filter = {}) => q(all(filter)));
  t.mock.method(Model, "findOne", (filter = {}) => q(all(filter)[0] || null));
  t.mock.method(Model, "findById", (id) =>
    q(
      (mongoose.isValidObjectId(id) && docs.find((doc) => same(doc._id, id))) ||
        null,
    ),
  );
  t.mock.method(
    Model,
    "countDocuments",
    async (filter = {}) => all(filter).length,
  );
  t.mock.method(Model, "exists", async (filter = {}) =>
    all(filter)[0] ? { _id: all(filter)[0]._id } : null,
  );
  t.mock.method(Model, "distinct", async (field, filter = {}) => [
    ...new Map(
      all(filter)
        .flatMap((doc) => valuesAt(plain(doc), field))
        .filter((v) => v != null && !Array.isArray(v))
        .map((v) => [key(v), v]),
    ).values(),
  ]);
  t.mock.method(Model, "updateMany", async (filter, update) => {
    const hit = all(filter);
    hit.forEach((doc) => apply(doc, update));
    return { modifiedCount: hit.length };
  });
  t.mock.method(Model, "updateOne", async (filter, update) => {
    const doc = all(filter)[0];
    if (doc) apply(doc, update);
    return { modifiedCount: doc ? 1 : 0 };
  });
  t.mock.method(Model, "findOneAndUpdate", async (filter, update) => {
    const doc = all(filter)[0];
    if (!doc) return null;
    apply(doc, update);
    return doc;
  });
  t.mock.method(Model, "deleteMany", async (filter) => {
    const hit = all(filter);
    hit.forEach((doc) => docs.splice(docs.indexOf(doc), 1));
    return { deletedCount: hit.length };
  });
  t.mock.method(Model, "deleteOne", async (filter) => {
    const doc = all(filter)[0];
    if (doc) docs.splice(docs.indexOf(doc), 1);
    return { deletedCount: doc ? 1 : 0 };
  });
  t.mock.method(Model, "create", async (fields) => store.add(fields));
  return store;
};
