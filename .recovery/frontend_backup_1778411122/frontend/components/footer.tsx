"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { GitHubLogoIcon, TwitterLogoIcon } from "@radix-ui/react-icons";

const Footer = () => {
  const year = new Date().getFullYear();

  const socialLinks = [
    {
      name: "Twitter",
      href: "https://x.com/VoiceReaderAI",
      icon: TwitterLogoIcon,
    },
    {
      name: "GitHub",
      href: "https://github.com/voicereaderai",
      icon: GitHubLogoIcon,
    },
  ];

  return (
    <footer className="w-full bg-card">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center text-center space-y-6"
        >
          <Link
            href="/"
            className="text-xl font-medium hover:opacity-80 transition-opacity flex items-center gap-3"
          >
            <Image
              src="/logo_2.png"
              alt="VoiceReaderAI logo"
              width={32}
              height={32}
              className="h-9 w-9"
              priority
            />
            VoiceReaderAI
          </Link>
          <div className="flex space-x-3">
            {socialLinks.map((social) => (
              <Button
                key={social.name}
                asChild
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-muted/50"
              >
                <Link
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.name}
                >
                  <social.icon className="h-4 w-4" />
                </Link>
              </Button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 text-sm text-muted-foreground">
            <span>© {year} VoiceReaderAI</span>
            <span className="hidden sm:inline">•</span>
            <span className="font-medium">NAVER Vietnam AI Hackathon</span>
          </div>
        </motion.div>
      </div>
    </footer>
  );
};

export default Footer;
