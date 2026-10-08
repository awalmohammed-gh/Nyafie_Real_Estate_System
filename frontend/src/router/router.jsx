import { AdminLogin, AgentLayout, OnboardingLayout, Onboarding, ApplicationStatus, AdminAgentApplications, Home, Contact, PropertiesDetails, SlugPage, PropertyAction, AgentDetailsPage, NotFound, AuthPage, Profile, AgentProfile, SavedProperties, MyInquiries, Settings, AccountMessages, MyOffers, MyRentals, MyPurchases, AgentSaleRequests, AdminSaleRequests, AgentOffers, AgentRentals, AdminOffers, AdminRentals, AdminPayments, PaymentResult, AgentMessages, AdminMessages, Plans, Checkout, Dashboard, MyProperties, PropertyEditor, Inquiries, PropertyManage, Subscription, AdminLayout, AdminDashboard, AdminUsers, AdminAgents, AdminProperties, AdminInquiries, AdminContactMessages, AdminReviews, AdminSubscriptions, AdminPlans, AdminReports, AdminSettings, AdminPropertyEditor } from './routePages';
import {createBrowserRouter, createRoutesFromElements, Navigate, Route} from 'react-router-dom'
import SessionLayout from '../layout/SessionLayout'
import SystemLayout from '../layout/SystemLayout'
import RequireAuth from '../components/auth/RequireAuth'
import RequireAgent from '../components/auth/RequireAgent'
import RequireAgentSession from '../components/auth/RequireAgentSession'
import OnboardingRedirect from '../components/auth/OnboardingRedirect'
import RequireAdmin from '../components/auth/RequireAdmin'

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route element={<SessionLayout />}>
         <Route path='/' element={<SystemLayout />}>
            <Route index element={<Home />} />
            <Route path='house/:id' element={<PropertiesDetails />} />
            <Route path='offer' element={<Navigate to='/account/offers' replace />} />
            {/* Rent Now, Buy Now and Make Offer: signed-out visitors see a sign-in prompt and come back after signing in */}
            <Route path='make-offer/:propertyId' element={<PropertyAction mode='offer' key='offer' />} />
            <Route path='checkout/rent/:propertyId' element={<PropertyAction mode='rent' key='rent' />} />
            <Route path='checkout/buy/:propertyId' element={<PropertyAction mode='buy' key='buy' />} />
            {/* /properties, /listings, /agents (URLs set in Admin Settings) and /sale, /rent */}
            <Route path=':slug' element={<SlugPage />} />
            <Route path='contact' element={<Contact />} />

            {/* Becoming an agent: the plans page is public; onboarding has its own layout below */}
            <Route path='agent/plans' element={<Plans />} />
            <Route element={<RequireAuth />}>
               <Route path='agent/:id' element={<AgentDetailsPage />} />
               <Route path='agents/:id' element={<AgentDetailsPage />} />
               <Route path='account/profile' element={<Profile />} />
               <Route path='account/saved' element={<SavedProperties />} />
               <Route path='account/inquiries' element={<MyInquiries />} />
               <Route path='account/settings' element={<Settings />} />
               <Route path='account/messages' element={<AccountMessages />} />
               <Route path='account/offers' element={<MyOffers />} />
               <Route path='account/rentals' element={<MyRentals />} />
               <Route path='account/purchases' element={<MyPurchases />} />
               <Route path='payment/success' element={<PaymentResult />} />
               <Route path='payment/failed' element={<PaymentResult />} />
            </Route>

            <Route path='*' element={<NotFound />} />
         </Route>

         {/* Agent onboarding: Account -> Profile -> Subscription -> Review, in a focused layout (no navbar or footer).
             /agent/onboarding opens the step the server says is next */}
         <Route element={<RequireAgentSession />}>
            <Route element={<OnboardingLayout />}>
               <Route path='agent/onboarding' element={<OnboardingRedirect />} />
               <Route path='agent/onboarding/profile' element={<Onboarding />} />
               <Route path='agent/onboarding/subscription' element={<Plans />} />
               <Route path='agent/onboarding/plans' element={<Navigate to='/agent/onboarding/subscription' replace />} />
               <Route path='agent/checkout' element={<Checkout />} />
               <Route path='agent/status' element={<ApplicationStatus />} />
            </Route>
         </Route>

         {/* Full-screen auth pages (no navbar or footer) */}
         <Route path='login' element={<AuthPage mode="login" />} />
         <Route path='register' element={<AuthPage mode="signup" />} />

         <Route path='agent/login' element={<AuthPage />} />
         <Route path='agent/register' element={<AuthPage mode="signup" />} />
         <Route path='admin/login' element={<AdminLogin />} />

         {/* Agent-only workspace */}
         <Route element={<RequireAgent />}>
            <Route path='agent' element={<AgentLayout />}>
               <Route index element={<Navigate to='dashboard' replace />} />
               <Route path='dashboard' element={<Dashboard />} />
               <Route path='properties' element={<MyProperties />} />
               <Route path='properties/add' element={<PropertyEditor key="add" />} />
               <Route path='properties/:propertyId/edit' element={<PropertyEditor key="edit" />} />
               <Route path='properties/:propertyId' element={<PropertyManage />} />
               <Route path='inquiries' element={<Inquiries />} />
               <Route path='offers' element={<AgentOffers />} />
               <Route path='rentals' element={<AgentRentals />} />
               <Route path='sale-requests' element={<AgentSaleRequests />} />
               <Route path='messages' element={<AgentMessages />} />
               <Route path='profile' element={<Navigate to='/agent/settings' replace />} />
               <Route path='settings' element={<AgentProfile />} />
               <Route path='subscription/plans' element={<Plans />} />
               <Route path='subscription/checkout' element={<Checkout />} />
               <Route path='subscription' element={<Subscription />} />
            </Route>
         </Route>
         {/* Admin console */}
         <Route element={<RequireAdmin />}>
            <Route path='admin' element={<AdminLayout />}>
               <Route index element={<Navigate to='dashboard' replace />} />
               <Route path='dashboard' element={<AdminDashboard />} />
               <Route path='customers' element={<AdminUsers />} />
               <Route path='users' element={<Navigate to='/admin/customers' replace />} />
               <Route path='agents' element={<AdminAgents />} />
               <Route path='agent-applications' element={<AdminAgentApplications />} />
               <Route path='properties' element={<AdminProperties />} />
               <Route path='inquiries' element={<AdminInquiries />} />
               <Route path='contact-messages' element={<AdminContactMessages />} />
               <Route path='reviews' element={<AdminReviews />} />
               <Route path='offers' element={<AdminOffers />} />
               <Route path='rentals' element={<AdminRentals />} />
               <Route path='sale-requests' element={<AdminSaleRequests />} />
               <Route path='payments' element={<AdminPayments />} />
               <Route path='messages' element={<AdminMessages />} />
               <Route path='properties/add' element={<AdminPropertyEditor />} />
               <Route path='properties/:propertyId/edit' element={<AdminPropertyEditor />} />
               <Route path='subscriptions' element={<AdminSubscriptions />} />
               <Route path='plans' element={<AdminPlans />} />
               <Route path='reports' element={<AdminReports />} />
               <Route path='settings' element={<AdminSettings />} />
            </Route>
         </Route>
        </Route>
    )
)

export default router;
