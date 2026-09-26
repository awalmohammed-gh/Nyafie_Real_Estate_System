import { useState } from 'react';
import { motion } from "motion/react";
import { CheckCircle2, Clock, Mail, MapPin, Phone, Send } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Reveal from '../components/ui/Reveal';

const contactInfo = [
  { icon: MapPin, title: "Visit us", lines: ["123 Independence Avenue,", "Airport City, Accra, Ghana"] },
  { icon: Phone, title: "Call us", lines: ["+233 24 152 9904"], href: "tel:+233241529904" },
  { icon: Mail, title: "Email us", lines: ["info@homebase.com"], href: "mailto:info@homebase.com" },
  { icon: Clock, title: "Office hours", lines: ["Mon - Fri: 9:00 AM - 6:00 PM", "Sat: 10:00 AM - 4:00 PM"] },
];

const emptyForm = { name: "", email: "", phone: "", subject: "", message: "" };

const Contact = () => {
  const [formData, setFormData] = useState(emptyForm);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: send formData to the backend once a contact endpoint exists
    setSubmitted(true);
    setFormData(emptyForm);
  };

  return (
    <>
      <PageHeader
        title="Get in Touch"
        description="Have a question about a property or want to work with one of our agents? We'd love to hear from you."
        image="/agBg.jpg"
        crumbs={[{ label: "Contact" }]}
      />

      <section className="container-page grid gap-8 py-12 sm:py-16 lg:grid-cols-3 lg:gap-10">
        {/* Contact info */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:content-start">
          {contactInfo.map(({ icon: Icon, title, lines, href }, index) => (
            <Reveal key={title} delay={index * 0.06}>
              <div className="flex h-full items-start gap-4 rounded-3xl bg-gray-50 p-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-brand-500 shadow-sm">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-bold text-gray-900">{title}</h2>
                  {lines.map((line) =>
                    href ? (
                      <a key={line} href={href} className="block text-sm text-gray-600 transition hover:text-brand-600">
                        {line}
                      </a>
                    ) : (
                      <p key={line} className="text-sm text-gray-600">{line}</p>
                    )
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Form */}
        <Reveal className="lg:col-span-2">
          <div className="rounded-3xl bg-white p-6 ring-1 ring-gray-200/80 sm:p-10">
            {submitted ? (
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-12 text-center">
                <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </span>
                <h2 className="mt-6 text-2xl font-extrabold text-gray-900">Message sent!</h2>
                <p className="mt-2 text-gray-600">Thanks for reaching out. Our team will get back to you shortly.</p>
                <button onClick={() => setSubmitted(false)} className="btn btn-light mt-8">
                  Send another message
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">Send us a message</h2>
                  <p className="mt-1 text-gray-500">We usually reply within one business day.</p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-700">Full name</label>
                    <input id="name" name="name" value={formData.name} onChange={handleChange} required autoComplete="name" placeholder="Your name" className="field" />
                  </div>
                  <div>
                    <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
                    <input id="email" type="email" name="email" value={formData.email} onChange={handleChange} required autoComplete="email" placeholder="you@example.com" className="field" />
                  </div>
                  <div>
                    <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-gray-700">
                      Phone <span className="text-gray-400">(optional)</span>
                    </label>
                    <input id="phone" type="tel" name="phone" value={formData.phone} onChange={handleChange} autoComplete="tel" placeholder="+233 ..." className="field" />
                  </div>
                  <div>
                    <label htmlFor="subject" className="mb-1.5 block text-sm font-medium text-gray-700">Subject</label>
                    <input id="subject" name="subject" value={formData.subject} onChange={handleChange} required placeholder="How can we help?" className="field" />
                  </div>
                </div>
                <div>
                  <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-gray-700">Message</label>
                  <textarea id="message" name="message" value={formData.message} onChange={handleChange} required rows={6} placeholder="Tell us a little about what you're looking for..." className="field resize-none" />
                </div>
                <button type="submit" className="btn btn-primary w-full sm:w-auto">
                  <Send className="h-4 w-4" />
                  Send Message
                </button>
              </form>
            )}
          </div>
        </Reveal>
      </section>
    </>
  );
};

export default Contact;
