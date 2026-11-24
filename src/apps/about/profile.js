// Single source of truth for everything the portfolio apps say about Athul.
// Facts come from the resume (Documents/ATHULPRAKASHNJ_RESUME.pdf), the certificates in
// ~/Documents, the event photos in ~/Pictures/Achievements and the public GitHub profile.
// Nothing in here is invented: if it is not in one of those sources it is not listed.

const HOME = "/home/sherlock";
const DOCS = `${HOME}/Documents`;
const ALBUMS = `${HOME}/Pictures/Achievements`;

export const profile = {
  name: "Athul Prakash NJ",
  shortName: "Athul",
  alias: "psychoSherlock",
  title: "Security Analyst (VAPT)",
  roles: ["Penetration Tester", "Bug Bounty Hunter", "CTF Developer", "Security Researcher"],
  tagline: "I break things on purpose, write down how, and help fix them.",
  location: "Kerala, India",
  email: "athulprakashnj@gmail.com",
  avatar: `${HOME}/Pictures/Personal/me.jpeg`,
  resume: `${DOCS}/ATHULPRAKASHNJ_RESUME.pdf`,

  bio: [
    "Security enthusiast with hands-on experience in VAPT, application security and exploit development across web, mobile and cloud environments.",
    "I find and validate critical vulnerabilities, build security automation and write assessment reports people can actually act on. Outside client work I hunt bugs on public and private programs, research CVEs and play (and build) competitive CTFs.",
  ],

  stats: [
    { value: "15+", label: "client environments assessed", icon: "shield" },
    { value: "2", label: "CVE exploits on Exploit-DB", icon: "bug" },
    { value: "Top 8", label: "Asia/Oceania, Kaspersky{CTF}", icon: "trophy" },
    { value: "5+", label: "Boot2Root labs built", icon: "flag" },
  ],

  focus: [
    "Penetration Testing",
    "Web Application Security",
    "Android Security",
    "Cloud Security",
    "Network Security",
    "Vulnerability Research",
  ],

  experience: [
    {
      org: "Apnisec",
      role: "Security Analyst (VAPT)",
      period: "Jun 2025 - Sep 2025",
      place: "Remote",
      url: "https://apnisec.com",
      points: [
        "Performed end-to-end VAPT across 15+ client environments, assessing 100+ assets per client including web apps, subdomains, Android apps and production infrastructure.",
        "Conducted asset discovery and attack surface mapping, identifying exposed services, misconfigurations and weak trust boundaries.",
        "Identified and exploited critical vulnerabilities including Account Takeovers, Authentication & Authorization Bypass, IDOR, Business Logic flaws, Cryptographic Bypass and XSS.",
        "Authored client-facing assessment reports with clear reproduction steps, impact analysis and remediation guidance.",
        "Built automation scripts for detecting asset misconfigurations and exposed endpoints; took part in CERT-In empanelment-style labs involving reverse engineering and low-level analysis.",
      ],
    },
    {
      org: "VDP Programs",
      role: "Bug Bounty Hunter",
      period: "Jan 2023 - Present",
      place: "India",
      url: "https://hackerone.com/psychosherlock",
      points: [
        "Reported high-impact vulnerabilities including Account Takeover, Business Logic flaws, Authentication & Authorization Bypass, IDOR, Rate Limiting issues and Reflected XSS across public and private programs.",
        "Gained root access to scammer infrastructure and cloud assets during an investigation; performed responsible disclosure and assisted Kerala Police.",
        "Reported an Open Redirection in a Next.js application under a private bug bounty program.",
      ],
    },
    {
      org: "Fetlla",
      role: "Security Engineer and Developer",
      period: "Jun 2023 - Present",
      place: "Kerala",
      url: "https://fetlla.com",
      points: [
        "Developed custom Nuclei templates to automate detection of vulnerable WordPress plugins and common misconfigurations.",
        "Published CVE exploits on Exploit-DB, leveraging reverse engineering and offensive testing techniques.",
        "Built 5+ Boot2Root CTF labs with Docker and Vagrant featuring real-world vulnerabilities such as SSRF, IDOR and XSS, and mentored within the security community.",
      ],
    },
    {
      org: "MITS",
      role: "Tech Lead, ACM & MITS Cyber Security Club",
      period: "Oct 2023 - Present",
      place: "Kerala",
      url: "https://mgmits.ac.in",
      points: [
        "Led authorized security assessments of campus infrastructure, including exploitation of Hikvision CVE-2017-7921, privilege escalation and coordinated remediation with authorities.",
        "Designed CTF labs and managed infrastructure, orchestration and deployment for club events.",
        "Built and maintained CTF environments on Docker, AWS, GCP, Oracle Cloud and Redis, keeping them scalable and reliable.",
      ],
    },
  ],

  education: [
    {
      school: "Muthoot Institute of Technology and Science",
      degree: "BTech, Computer Science & Cyber Security",
      period: "Oct 2023 - Present",
    },
    {
      school: "St. Thomas HSS Kelakam, Kannur",
      degree: "Higher Secondary, Computer Science",
      period: "Std. 12, 2022-23",
    },
  ],

  publications: [
    {
      title: "WP Statistics - Time based SQL injection",
      venue: "Exploit-DB",
      date: "Feb 2022",
      url: "https://www.exploit-db.com/exploits/51711",
      note: "CVE-2022-25148 and CVE-2022-25149. Unauthenticated exploit for WP Statistics <= 13.1.5 (ip & current_page_id).",
    },
    {
      title: "Attacking Home Routers: The ROM-0 Vulnerability [With Exploit]",
      venue: "Medium",
      date: "Apr 2023",
      url: "https://medium.com/@psychoSherlock",
    },
    {
      title: "Choosing your exploits",
      venue: "Medium",
      date: "Jul 2023",
      url: "https://medium.com/@psychoSherlock",
    },
  ],

  work: [
    {
      title: "CTF Boxes",
      text: "Vulnerable Linux labs featuring IDORs, JWT issues, LLM security issues, RCE and privilege escalation, used for hands-on training and CTFs. Published on TryHackMe and in private competitions.",
    },
    {
      title: "CTF Labs",
      text: "Web, Android and Cloud challenges of every difficulty, open on GitHub.",
      url: "https://github.com/psychoSherlock/labs",
    },
    {
      title: "CTF Infrastructure",
      text: "Managed, orchestrated and secured event infrastructure on AWS, GCP and Oracle Cloud: CI/CD, Docker environments, IDS with Falco and IPS with fail2ban.",
    },
  ],

  certifications: [
    {
      title: "Certified AppSec Practitioner (CAP)",
      issuer: "The SecOps Group",
      date: "16 Mar 2024",
      note: "Passed with Merit. Certificate ID 8498989.",
      doc: `${DOCS}/AthulPrakashNj-CertifiedAppSecPractitioner.pdf`,
      url: "https://secops.group",
    },
  ],

  recognition: [
    {
      title: "Note of Appreciation",
      issuer: "Embibe",
      date: "Apr 2023",
      note: "For responsibly disclosing a security vulnerability. Listed on the Embibe Hall of Fame.",
      doc: `${DOCS}/April 2023 - Note of Appreciation .pdf`,
    },
    {
      title: "DomeCTF 2021 - Top 10",
      issuer: "Kerala Police CyberDome & Beagle Security",
      date: "2021",
      note: "Certificate for finishing in the Top 10 of DomeCTF 2021.",
      doc: `${DOCS}/CyberDome.jpg`,
    },
    {
      title: "Certificate of Appreciation - Project Team",
      issuer: "TinkerHub MITS",
      date: "2024",
      note: "For contributions as a member of the TinkerHub MITS project team.",
      doc: `${DOCS}/WhatsApp Image 2024-08-22 at 11.48.52 PM.jpeg`,
    },
    {
      title: "DM Meetup",
      issuer: "Certificate of Participation",
      date: "May 2023",
      doc: `${DOCS}/DM_Meetup.pdf`,
    },
  ],

  achievements: [
    {
      id: "kaspersky",
      title: "Top 8 in Asia/Oceania",
      event: "Kaspersky{CTF} 2025",
      date: "Sep 2025",
      rank: "8th Asia/Oceania",
      description:
        "Team MCSC from MITS finished 8th in the Asia/Oceania regional league and 3rd among Indian teams at the global Kaspersky{CTF}.",
      album: `${ALBUMS}/Kaspersky{CTF}`,
      cover: `${ALBUMS}/Kaspersky{CTF}/IMG-20250911-WA0001.jpg`,
      docs: [],
    },
    {
      id: "exploitx",
      title: "2nd Runner-up, National Level CTF",
      event: "ExploitX CTF, Chennai Institute of Technology",
      date: "Aug 2025",
      rank: "2nd Runner-up",
      description:
        "Played as Team 127.0.0.1 with Krishna Rajeev. The finish came with a job offer from SecLance and a Hack The Box VIP+ subscription.",
      album: `${ALBUMS}/ExploitX`,
      cover: `${ALBUMS}/ExploitX/1754495760093.jpg`,
      docs: [],
    },
    {
      id: "hackatarch",
      title: "1st Place, Hack@Arch CTF",
      event: "GEC Thrissur & TinkerHub",
      date: "Mar 2025",
      rank: "1st Place",
      description:
        "Team 127.0.0.1 topped the scoreboard with 1645 points and took home the Rs 10,000 prize.",
      album: `${ALBUMS}/GEC_CTF`,
      cover: `${ALBUMS}/GEC_CTF/Hack@Arch.jpg`,
      docs: [],
    },
    {
      id: "pegasus",
      title: "1st Place, Pegasus 3.0",
      event: "24-hour hackathon, IEEE SB MITS",
      date: "Jan 2025",
      rank: "1st Place",
      description:
        "Team Echoz won the 24-hour national level hackathon held on 10 & 11 January 2025 at Muthoot Institute of Technology and Science.",
      album: `${ALBUMS}/Pegasus 3.0`,
      cover: `${ALBUMS}/Pegasus 3.0/1736751366568.jpg`,
      docs: [],
    },
    {
      id: "baitcheck",
      title: "BaitCheck: Social Engineering & Phishing",
      event: "MITS Cyber Security Club session",
      date: "Oct 2025",
      rank: "Session",
      description:
        "\"Spot the bait, protect your gate\": a hands-on MCSC session on the tricks of phishing and how to outsmart online threats, held in the Diffie-Hellman Lab.",
      album: `${ALBUMS}/MCSC_BaitCheck`,
      cover: `${ALBUMS}/MCSC_BaitCheck/bait check.png`,
      docs: [],
    },
    {
      id: "techxcel",
      title: "3rd Place, TechXcel",
      event: "Microproject challenge, IEDC MITS",
      date: "Jul 2024",
      rank: "3rd Place",
      description:
        "Team Pythoneers placed third with a CCTV-based litter detection system trained on YOLOv8.",
      album: `${ALBUMS}/IEDC TechExcel`,
      cover: `${ALBUMS}/IEDC TechExcel/1724350639579.jpg`,
      docs: [`${DOCS}/Athul Prakash NJ.png`],
    },
    {
      id: "freshman-firewall",
      title: "1st Place, Freshman Firewall",
      event: "Intercollege CTF, Shreshta '24, MITS",
      date: "Mar 2024",
      rank: "1st Place",
      description:
        "First prize in the Freshman Firewall CTF at the MITS annual tech fest Shreshta '24, held on 1 & 2 March 2024.",
      album: `${ALBUMS}/Freshman Firewall`,
      cover: `${ALBUMS}/Freshman Firewall/1709749282076.jpg`,
      docs: [`${DOCS}/Freshman_Firewall.pdf`],
    },
    {
      id: "hacknight",
      title: "Best Project, Saturday Hacknight",
      event: "TinkerHub",
      date: "Feb 2024",
      rank: "Best Project",
      description:
        "Team Fsociety (with Sudheesh S) built a facial recognition system for class attendance marking using Keras.",
      album: `${ALBUMS}/Tinkerhub`,
      cover: `${ALBUMS}/Tinkerhub/1708803054825.jpg`,
      docs: [`${DOCS}/Tinkerhub_Hacknight.jpg`],
    },
    {
      id: "kerala-state",
      title: "2nd Prize, Kerala State IT Fair",
      event: "Web Page Designing, Kerala School Sasthrolsavam 2022-23",
      date: "Nov 2022",
      rank: "2nd Prize",
      description:
        "Second place with A grade in Web Page Designing (IT Mela, HSS/VHSS) at the state fair in Ernakulam, representing St. Thomas HSS Kelakam.",
      album: `${ALBUMS}/Kerala State`,
      cover: `${ALBUMS}/Kerala State/1670758949724.jpg`,
      docs: [`${DOCS}/Kerala_state.jpg`],
    },
    {
      id: "events",
      title: "Community Meetups",
      event: "YAS meetup with the Fetlla team",
      date: "",
      rank: "Community",
      description: "Photos from the YAS meetup with the Fetlla crew.",
      album: `${ALBUMS}/Events`,
      cover: `${ALBUMS}/Events/YAS_MEETUP.jpg`,
      docs: [],
    },
  ],

  skills: [
    {
      id: "offsec",
      title: "Offensive Security",
      items: [
        "VAPT",
        "Web Application Security",
        "Android Security",
        "Network Security",
        "Exploit Development",
        "Reverse Engineering",
        "Attack Surface Mapping",
        "Bug Bounty",
        "Report Writing",
      ],
    },
    {
      id: "vulns",
      title: "Vulnerability Classes",
      items: [
        "SQL Injection",
        "IDOR",
        "XSS",
        "SSTI",
        "SSRF",
        "CSRF",
        "Business Logic",
        "Account Takeover",
        "Auth Bypass",
        "Privilege Escalation",
      ],
    },
    {
      id: "code",
      title: "Python & JavaScript",
      items: [
        "Python",
        "JavaScript",
        "Automation",
        "Selenium",
        "Web Scraping",
        "Flask",
        "FastAPI",
        "React",
        "React Native",
        "Vite",
        "Next.js",
      ],
    },
    {
      id: "cloud",
      title: "Cloud & Orchestration",
      items: [
        "Docker",
        "Kubernetes",
        "Vagrant",
        "AWS",
        "GCP",
        "Oracle Cloud",
        "CI/CD",
        "Falco",
        "fail2ban",
        "Tailscale",
        "OpenVPN",
        "Redis",
        "MongoDB",
      ],
    },
    {
      id: "platforms",
      title: "Platforms",
      items: ["Linux", "Windows", "Android", "Servers"],
    },
  ],

  // Security tooling. `icon` is a file name in src/assets/images/icons/skills/.
  tools: [
    { name: "Burp Suite", icon: "burp.png", use: "Web proxy" },
    { name: "Nmap", icon: "nmap.png", use: "Network mapping" },
    { name: "Metasploit", icon: "msf.png", use: "Exploitation" },
    { name: "SQLMap", icon: "sqlmap.png", use: "SQL injection" },
    { name: "Hydra", icon: "hydra.png", use: "Login brute force" },
    { name: "John the Ripper", icon: "john.png", use: "Password cracking" },
    { name: "Hashcat", icon: "hashcat-logo.png", use: "Hash cracking" },
    { name: "Gobuster", icon: "gobuster-logo.png", use: "Content discovery" },
    { name: "ffuf", icon: "ffuf-logo.png", use: "Web fuzzing" },
    { name: "Wireshark", icon: "wireshark-logo.png", use: "Packet analysis" },
    { name: "Netcat", icon: "ncat.png", use: "Shells & pivots" },
    { name: "WPScan", icon: "wpscan.png", use: "WordPress audit" },
    { name: "Dirb", icon: "dirb-logo.png", use: "Content discovery" },
    { name: "DirBuster", icon: "dirbuster-logo.png", use: "Content discovery" },
    { name: "Mimikatz", icon: "mimikatz-logo.png", use: "Credential access" },
  ],
  moreTools: ["Frida", "Nuclei"],

  socials: [
    { id: "github", label: "GitHub", handle: "psychoSherlock", url: "https://github.com/psychoSherlock" },
    { id: "x", label: "X / Twitter", handle: "@psychoSherlock", url: "https://x.com/psychoSherlock" },
    {
      id: "linkedin",
      label: "LinkedIn",
      handle: "Athul Prakash NJ",
      url: "https://www.linkedin.com/in/athul-prakash-nj-564a80226/",
    },
    { id: "hackerone", label: "HackerOne", handle: "psychosherlock", url: "https://hackerone.com/psychosherlock" },
    { id: "medium", label: "Medium", handle: "@psychoSherlock", url: "https://medium.com/@psychoSherlock" },
    { id: "linktree", label: "Linktree", handle: "psychoSherlock", url: "https://linktr.ee/psychoSherlock" },
    { id: "website", label: "Website", handle: "psychosherlock.github.io", url: "https://psychosherlock.github.io" },
  ],
};

export default profile;
