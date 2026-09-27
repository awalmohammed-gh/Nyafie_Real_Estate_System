import {createBrowserRouter, createRoutesFromElements, Navigate, Route} from 'react-router-dom'
import SystemLayout from '../layout/SystemLayout'
import AgentLayout from '../layout/AgentLayout'
import RequireAuth from '../components/auth/RequireAuth'
import RequireAgent from '../components/auth/RequireAgent'
import Home from '../pages/Home'
import Contact from '../pages/Contact'
import PropertiesDetails from '../pages/PropertiesDetails'
import SlugPage from '../pages/SlugPage'
import PropertyAction from '../pages/PropertyAction'
import AgentDetailsPage from '../pages/AgentDetailsPage'
import NotFound from '../pages/NotFound'
import AuthPage from '../pages/auth/AuthPage'
import Profile from '../pages/account/Profile'
import SavedProperties from '../pages/account/SavedProperties'
import MyInquiries from '../pages/account/MyInquiries'
import Settings from '../pages/account/Settings'
import AccountMessages from '../pages/account/Messages'
import MyOffers from '../pages/account/MyOffers'
import MyRentals from '../pages/account/MyRentals'
import MyPurchases from '../pages/account/MyPurchases'
import AgentSaleRequests from '../pages/agent/SaleRequests'
import AdminSaleRequests from '../pages/admin/AdminSaleRequests'
import AgentOffers from '../pages/agent/Offers'
import AgentRentals from '../pages/agent/Rentals'
import AdminOffers from '../pages/admin/AdminOffers'
import AdminRentals from '../pages/admin/AdminRentals'
import AdminPayments from '../pages/admin/AdminPayments'
import PaymentResult from '../pages/PaymentResult'
import AgentMessages from '../pages/agent/Messages'
import AdminMessages from '../pages/admin/AdminMessages'
import Plans from '../pages/agent/Plans'
import Checkout from '../pages/agent/Checkout'
import Dashboard from '../pages/agent/Dashboard'
import MyProperties from '../pages/agent/MyProperties'
import PropertyEditor from '../pages/agent/PropertyEditor'
import Inquiries from '../pages/agent/Inquiries'
import PropertyManage from '../pages/agent/PropertyManage'
import Subscription from '../pages/agent/Subscription'
import RequireAdmin from '../components/auth/RequireAdmin'
import AdminLayout from '../layout/AdminLayout'
import AdminDashboard from '../pages/admin/AdminDashboard'
import AdminUsers from '../pages/admin/AdminUsers'
import AdminAgents from '../pages/admin/AdminAgents'
import AdminProperties from '../pages/admin/AdminProperties'
import AdminInquiries from '../pages/admin/AdminInquiries'
import AdminSubscriptions from '../pages/admin/AdminSubscriptions'
import AdminPlans from '../pages/admin/AdminPlans'
import AdminReports from '../pages/admin/AdminReports'
import AdminSettings from '../pages/admin/AdminSettings'
import AdminPropertyEditor from '../pages/admin/AdminPropertyEditor'

const router = createBrowserRouter(
    createRoutesFromElements(
        <>
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
            <Route path='agent/:id' element={<AgentDetailsPage />} />
            <Route path='contact' element={<Contact />} />

            {/* Becoming an agent: plans are public, checkout needs an account */}
            <Route path='agent/plans' element={<Plans />} />
            <Route element={<RequireAuth />}>
               <Route path='agent/checkout' element={<Checkout />} />
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

         {/* Full-screen auth pages (no navbar or footer) */}
         <Route path='login' element={<AuthPage mode="login" />} />
         <Route path='register' element={<AuthPage mode="signup" />} />

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
               <Route path='properties' element={<AdminProperties />} />
               <Route path='inquiries' element={<AdminInquiries />} />
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
        </>
    )
)

export default router;
