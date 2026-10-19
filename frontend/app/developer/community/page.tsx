import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight, FiGithub, FiMessageSquare } from "react-icons/fi";

export const metadata = {
  title: "Community",
  description: "Developer community and support for StellarVeriphy",
};

export default function CommunityPage() {
  const channels = [
    {
      icon: FiGithub,
      name: "GitHub Discussions",
      description: "Community forum hosted on GitHub for feature requests and discussions",
      members: "5000+",
      link: "https://github.com/Stellar-Veriphy/discussions",
    },
    {
      icon: FiMessageSquare,
      name: "Discord Community",
      description: "Real-time chat with developers and StellarVeriphy team members",
      members: "3000+",
      link: "https://discord.gg/stellarveriphy",
    },
    {
      icon: FiMessageSquare,
      name: "Stack Overflow",
      description: "Ask and answer questions tagged with stellarveriphy",
      members: "1000+",
      link: "https://stackoverflow.com/questions/tagged/stellarveriphy",
    },
    {
      icon: FiGithub,
      name: "GitHub Issues",
      description: "Report bugs and request features directly on GitHub",
      members: "500+",
      link: "https://github.com/Stellar-Veriphy/issues",
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Community">
      <Header />
      <div className="pt-16">
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="max-w-6xl mx-auto">
            <Link
              href="/developer"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 sm:mb-8 transition-colors"
            >
              <FiArrowLeft className="w-4 h-4" />
              Back to Developer Portal
            </Link>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Developer Community</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Connect with thousands of developers, share knowledge, and get support from the community.
            </p>
          </div>
        </section>

        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Community channels">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Join Our Community</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {channels.map((channel, index) => {
                const Icon = channel.icon;
                return (
                  <a
                    key={index}
                    href={channel.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group p-6 sm:p-8 bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-900/50 transition-all"
                  >
                    <Icon className="w-8 h-8 text-blue-400 mb-4 group-hover:scale-110 transition-transform" />
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
                      {channel.name}
                    </h2>
                    <p className="text-gray-300 text-sm sm:text-base mb-6 group-hover:text-gray-200 transition-colors">
                      {channel.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-blue-400 font-semibold text-sm">{channel.members} members</span>
                      <FiArrowRight className="w-4 h-4 text-blue-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Support options">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Get Support</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {[
                {
                  title: "Documentation",
                  description: "Comprehensive docs and API reference",
                  icon: "📖",
                  link: "/developer/api-docs",
                },
                {
                  title: "Email Support",
                  description: "Enterprise support with dedicated SLA",
                  icon: "📧",
                  link: "mailto:support@stellarveriphy.dev",
                },
                {
                  title: "Status Page",
                  description: "Real-time system status and incident reports",
                  icon: "📊",
                  link: "https://status.stellarveriphy.dev",
                },
              ].map((item, index) => (
                <a
                  key={index}
                  href={item.link}
                  target={item.link.startsWith("http") ? "_blank" : undefined}
                  rel={item.link.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="p-6 sm:p-8 bg-slate-700 rounded-lg border border-slate-600 hover:border-blue-600 transition-colors text-center"
                >
                  <div className="text-4xl mb-4">{item.icon}</div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-gray-400 text-sm">{item.description}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Code of conduct">
          <div className="max-w-4xl mx-auto bg-slate-800 rounded-lg border border-slate-700 p-6 sm:p-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 sm:mb-6">Community Guidelines</h2>
            <p className="text-gray-300 mb-4 text-sm sm:text-base">
              Our community is dedicated to providing a welcoming and supportive environment for all developers. We ask that all participants:
            </p>
            <ul className="space-y-3">
              {[
                "Be respectful and inclusive to all community members",
                "Provide constructive feedback and help others learn",
                "Share knowledge and contribute to the community",
                "Report issues responsibly and directly",
                "Follow all applicable laws and regulations",
              ].map((guideline, index) => (
                <li key={index} className="flex items-start gap-3 text-gray-300 text-sm sm:text-base">
                  <span className="text-green-400 font-bold">✓</span>
                  <span>{guideline}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
