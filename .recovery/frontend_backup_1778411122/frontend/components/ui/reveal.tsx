"use client";

import * as React from "react";
import { motion, useInView } from "framer-motion";

import { cn } from "@/lib/utils";

interface RevealProps {
    children: React.ReactNode;
    className?: string;
    delay?: number;
    duration?: number;
}

export default function Reveal({
    children,
    className,
    delay = 0,
    duration = 0.6,
}: RevealProps) {
    const ref = React.useRef<HTMLDivElement | null>(null);
    const isInView = useInView(ref, { once: true, margin: "-80px" });

    return (
        <motion.div
            ref={ref}
            className={cn("relative", className)}
            initial={{ opacity: 0, y: 32, filter: "blur(6px)" }}
            animate={isInView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
            transition={{ duration, delay, ease: [0.25, 0.1, 0.25, 1] }}
        >
            {children}
        </motion.div>
    );
}
