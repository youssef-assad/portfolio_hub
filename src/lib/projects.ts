export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  stack: string[];
  liveUrl: string;
  repoUrl?: string;
  accentColor: string;
  year: number;
  suggestedQuestions: string[];
  image?: string;
}

export const projects: Project[] = [
  {
    id: "trendpoll",
    name: "TrendPoll",
    tagline: "AI-curated US news with built-in civic voting.",
    description:
      "Full-stack platform that ingests US-only news, ranks and summarizes stories with a locally-served Mistral 7B via Ollama, and lets readers register opinions on a per-story civic poll. Streams updates to the client over SSE.",
    stack: [
      "React",
      "Vite",
      "Express",
      "Node.js",
      "PostgreSQL",
      "Prisma",
      "Ollama",
      "Mistral 7B",
      "SSE",
    ],
    liveUrl: "https://trendpoll.v0.primesay.com",
    accentColor: "#2563eb",
    year: 2026,
    suggestedQuestions: [
      "Why Mistral 7B and not GPT-4?",
      "How does the anonymous voting work?",
      "What was the hardest bug you fixed?",
      "What are TrendPoll's biggest limitations?",
    ],
    image: "/projects/trendpoll.png",
  },
  {
    id: "primesay-ai",
    name: "Primesay AI",
    tagline: "Internal AI tooling for the Primesay platform.",
    description:
      "Suite of internal AI services running on Kubernetes with Istio service mesh on AWS EKS. Powers retrieval, summarization, and operational copilots used across Primesay teams.",
    stack: ["Next.js", "Kubernetes", "Istio", "AWS EKS"],
    liveUrl: "https://voice-video-generator.v0.primesay.com/",
    accentColor: "#f97316",
    year: 2026,
    suggestedQuestions: [
      "Why bundle four TTS engines?",
      "How does the Chatterbox GPU swap work?",
      "Why is audience verification disabled?",
      "What are the known limitations?",
    ],
    image: "/projects/primesay-ai.png",
  },
  {
    id: "primesay-translation",
    name: "Primesay Translation",
    tagline: "Self-hosted translation API on M2M-100, served via CTranslate2.",
    description:
      "An internal Primesay translation service handling 24 languages with GPU-accelerated inference. Built around Meta's M2M-100 1.2B (Apache-2.0), served through CTranslate2 with int8_float16 quantization for 2-4× speedup over vanilla transformers. Deployed on EKS GPU nodes behind an Istio gateway. Preserves emojis, @mentions, hashtags, and URLs through translation; recursive batch-halving keeps the API alive under GPU pressure.",
    stack: [
      "FastAPI",
      "Python",
      "M2M-100",
      "CTranslate2",
      "FastText",
      "PyTorch",
      "CUDA",
      "Docker",
      "Kubernetes",
      "AWS EKS",
      "Istio",
    ],
    liveUrl: "#",
    accentColor: "#a855f7",
    year: 2026,
    image: "/projects/primesay-translation.png",
    suggestedQuestions: [
      "Why M2M-100 1.2B and not NLLB-200?",
      "How do you handle GPU OOM on long texts?",
      "How do emojis and @mentions survive translation?",
      "What are the known limitations?",
    ],
  },
];
