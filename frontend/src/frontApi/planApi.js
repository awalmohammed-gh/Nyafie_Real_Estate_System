import client from "./client";
import { mapPlan, toApiPlan } from "./mappers";

export const getPlans = async ({ all = false } = {}) => (await client.get("/plans", { params: all ? { all: true } : {} })).data.map(mapPlan);
export const createPlan = async (plan) => mapPlan((await client.post("/plans", toApiPlan(plan))).data);
export const updatePlan = async (id, plan) => mapPlan((await client.put(`/plans/${id}`, toApiPlan(plan))).data);
export const deletePlan = (id) => client.delete(`/plans/${id}`);
