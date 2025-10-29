"use client";

import { cn } from "@/lib/utils";

export function AppleLoader({ className }: { className?: string }) {
  return (
    <div className={cn("w-12 h-12 relative", className)}>
      <style>{`
        .apple-loader-bar {
          animation: apple-loader-fade 1s infinite;
          background-color: #fff;
          border-radius: 1px;
          height: 4px;
          position: absolute;
          width: 8px;
          left: 50%;
          margin-left: -4px;
          top: 50%;
          margin-top: -2px;
        }
        @keyframes apple-loader-fade {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0.2;
          }
        }
      `}</style>
      <div className="apple-loader-bar" style={{ transform: "rotate(0deg) translate(0, -14px)", animationDelay: "0s" }} />
      <div className="apple-loader-bar" style={{ transform: "rotate(30deg) translate(0, -14px)", animationDelay: "-0.9167s" }} />
      <div className="apple-loader-bar" style={{ transform: "rotate(60deg) translate(0, -14px)", animationDelay: "-0.8333s" }} />
      <div className="apple-loader-bar" style={{ transform: "rotate(90deg) translate(0, -14px)", animationDelay: "-0.75s" }} />
      <div className="apple-loader-bar" style={{ transform: "rotate(120deg) translate(0, -14px)", animationDelay: "-0.6667s" }} />
      <div className="apple-loader-bar" style={{ transform: "rotate(150deg) translate(0, -14px)", animationDelay: "-0.5833s" }} />
      <div className="apple-loader-bar" style={{ transform: "rotate(180deg) translate(0, -14px)", animationDelay: "-0.5s" }} />
      <div className="apple-loader-bar" style={{ transform: "rotate(210deg) translate(0, -14px)", animationDelay: "-0.4167s" }} />
      <div className="apple-loader-bar" style={{ transform: "rotate(240deg) translate(0, -14px)", animationDelay: "-0.3333s" }} />
      <div className="apple-loader-bar" style={{ transform: "rotate(270deg) translate(0, -14px)", animationDelay: "-0.25s" }} />
      <div className="apple-loader-bar" style={{ transform: "rotate(300deg) translate(0, -14px)", animationDelay: "-0.1667s" }} />
      <div className="apple-loader-bar" style={{ transform: "rotate(330deg) translate(0, -14px)", animationDelay: "-0.0833s" }} />
    </div>
  );
}
