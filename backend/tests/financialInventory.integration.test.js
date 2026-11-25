import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import Subscription from "../models/Subscription.js";
import adminRoutes from "../routes/adminRoutes.js";
import { isolatedMongo } from "./support/isolatedMongo.js";
import { customerTabHeaders } from "./support/customerTab.js";
import { TEST_SESSION } from "./support/sessions.js";

test("financial inventory combines cash ledgers without counting attempts, credits or refunds as receipts", {skip:process.env.RUN_FINANCE_INTEGRATION!=="1",timeout:90000}, async t=>{
  await isolatedMongo(t);
  const oldKey=process.env.JWT_KEY;process.env.JWT_KEY="isolated-finance-test-signing-key-only";
  t.after(()=>{if(oldKey===undefined)delete process.env.JWT_KEY;else process.env.JWT_KEY=oldKey;});
  const admin=await User.create({ emailVerifiedAt: new Date(),firstName:"Finance",lastName:"Admin",email:"admin@finance.test",password:"FinanceTest123",role:"admin"});
  const customer=await User.create({ emailVerifiedAt: new Date(),firstName:"Rental",lastName:"Customer",email:"customer@finance.test",password:"FinanceTest123"});
  const agent=await User.create({ emailVerifiedAt: new Date(),firstName:"Plan",lastName:"Agent",email:"agent@finance.test",password:"FinanceTest123",role:"agent"});
  const home=await Property.create({title:"Finance test home",owner:admin.id,ownerType:"admin",propertyType:"Apartment",listingType:"Rent",price:100,pricePeriod:"month",status:"published"});
  const hotel=await Property.create({title:"Finance test hotel",owner:admin.id,ownerType:"admin",propertyType:"Hotel",listingType:"Rent",price:100,pricePeriod:"night",status:"published"});
  const booking=await Rental.create({property:home.id,hotelId:hotel.id,customer:customer.id,owner:admin.id,ownerType:"admin",startDate:"2024-02-01",endDate:"2024-02-02",pricePeriod:"night",unitPrice:20,units:1,amount:20,contactName:"Test",contactEmail:"test@finance.test",contactPhone:"0241234567"});
  const app=express();app.use(express.json(),cookieParser());app.use("/api/admin",adminRoutes);app.use((error,_req,res,_next)=>res.status(error.status||500).json({success:false,message:error.message}));
  const server=app.listen(0,"127.0.0.1");await new Promise(done=>server.once("listening",done));t.after(()=>new Promise(done=>server.close(done)));
  const url=`http://127.0.0.1:${server.address().port}/api/admin/inventory`;
  const cookie=(user,session)=>`${session}_token=${jwt.sign({sid:TEST_SESSION,id:user.id,role:user.role,session},process.env.JWT_KEY,{expiresIn:"1h"})}`;
  const call=async(query="",auth=cookie(admin,"admin"),domain="admin")=>{const response=await fetch(url+query,{headers:{"X-Session-Domain":domain,...customerTabHeaders(domain),...(auth?{Cookie:auth}:{})}});return {status:response.status,headers:response.headers,...await response.json()};};
  let sequence=0;
  const payment=(amount,status="paid",extra={})=>Payment.create({kind:"rental",customer:customer.id,property:home.id,owner:admin.id,ownerType:"admin",amount,method:"Paystack",reference:`FIN-${++sequence}`,status,createdAt:new Date("2024-02-15"),...extra});
  const subscription=(amount,paymentStatus="paid",extra={})=>Subscription.create({user:agent.id,plan:new mongoose.Types.ObjectId(),planName:"Finance plan",amount,paymentReference:`SUB-${++sequence}`,paymentStatus,createdAt:new Date("2024-02-15"),...extra});
  await t.test("only signed-in admins can read financial data",async()=>{
    assert.equal((await call("",null)).status,401);
    assert.equal((await call("",cookie(customer,"customer"),"customer")).status,403);
    assert.equal((await call("",cookie(agent,"agent"),"agent")).status,403);
  });
  await t.test("an empty ledger has four zero sectors and no NaN or missing totals",async()=>{
    const response=await call();assert.equal(response.status,200);assert.equal(response.data.sectors.length,4);assert.equal(response.data.totals.paid,0);assert.equal(response.data.total,0);assert.deepEqual(response.data.rows,[]);
  });
  await payment(0.1);await payment(0.2);await payment(1.125);
  await payment(20,"paid",{rental:booking.id});await payment(30,"paid",{property:hotel.id});
  await payment(100,"paid",{kind:"sale",method:"Office",owner:agent.id,ownerType:"agent",createdAt:new Date("2024-01-01"),paidAt:new Date("2024-02-29T23:59:59.999Z")});
  await subscription(49.99,"paid",{createdAt:new Date("2024-01-01"),paidAt:new Date("2024-02-01")});
  await payment(60,"pending");await payment(200,"pending",{kind:"sale",method:"Office"});await subscription(25,"pending");
  await payment(10,"failed");await subscription(2,"failed");
  await payment(15,"duplicate");await payment(16,"refund_required");
  await payment(999,"paid",{method:"Test payment"});await payment(999,"paid",{currency:"USD"});await payment(0);
  await subscription(999,"waived");await subscription(999,"paid",{paymentMethod:"Plan credit"});await subscription(999,"paid",{paymentMethod:"Test payment"});await subscription(0);
  const dates="?from=2024-02-01&to=2024-02-29";
  await t.test("sums integer pesewas, separates four sectors and excludes non-cash records",async()=>{
    const {status,data,headers}=await call(dates);assert.equal(status,200);assert.equal(headers.get("cache-control"),"private, no-store");
    assert.deepEqual(data.sectors.map(s=>[s.key,s.paid]),[["rental",1.43],["hotel",50],["sale",100],["subscription",49.99]]);
    assert.equal(data.totals.paid,201.42);assert.equal(data.totals.paidCount,7);assert.equal(data.totals.pending,285);assert.equal(data.totals.failed,12);assert.equal(data.totals.review,31);
    assert.equal(data.total,14);assert.ok(data.rows.every(row=>row.amount>0));
    assert.ok(!JSON.stringify(data).includes("authorizationUrl"));assert.ok(!JSON.stringify(data).includes("@finance.test"));
  });
  await t.test("uses payment confirmation dates and inclusive end dates",async()=>{
    const january=await call("?from=2024-01-01&to=2024-01-31");assert.equal(january.data.totals.paid,0);
    const lastDay=await call("?from=2024-02-29&to=2024-02-29");assert.equal(lastDay.data.totals.paid,100);
  });
  await t.test("ledger filters do not change the all-sector accounting summary",async()=>{
    const {data}=await call(dates+"&sector=subscription&status=paid");assert.equal(data.total,1);assert.equal(data.rows[0].amount,49.99);assert.equal(data.totals.paid,201.42);
    assert.equal((await call(dates+"&status=review")).data.total,2);
    const literal=await payment(1,"pending",{reference:"literal[ref].*"});
    const result=await call(dates+"&search="+encodeURIComponent("[ref].*"));assert.equal(result.data.total,1);assert.equal(result.data.rows[0].reference,literal.reference);
  });
  await t.test("ledger search matches account names and exact amounts without changing totals",async()=>{
    const byName=await call(dates+"&search="+encodeURIComponent("Plan Agent"));
    assert.equal(byName.data.total,3);assert.ok(byName.data.rows.every(row=>row.sector==="subscription"));
    const byAmount=await call(dates+"&search="+encodeURIComponent("GH₵49.99"));
    assert.equal(byAmount.data.total,1);assert.equal(byAmount.data.rows[0].amount,49.99);
    assert.equal(byAmount.data.totals.paid,201.42);
    const combined=await call(dates+"&search=49.99&status=pending");assert.equal(combined.data.total,0);
  });
  await t.test("paginates records without duplicating or skipping rows and retains deleted-account history",async()=>{
    for(let i=0;i<25;i++)await payment(1,"pending");
    const first=(await call(dates)).data,second=(await call(dates+"&page=2")).data;
    assert.equal(first.rows.length,20);assert.equal(second.rows.length,20);assert.ok(first.rows.every(row=>!second.rows.some(other=>other.id===row.id&&other.source===row.source)));
    await User.deleteOne({_id:customer.id});assert.ok((await call(dates)).data.rows.some(row=>row.name==="Deleted account"));
  });
  await t.test("rejects invalid dates, ranges, pagination, statuses and search values",async()=>{
    for(const query of ["?from=bad","?from=2024-02-30","?from=2024-03-01&to=2024-02-01","?page=0","?page=-1","?page=1.5","?sector=other","?status=waived","?search="+"x".repeat(101)])assert.equal((await call(query)).status,400,query);
  });
});
