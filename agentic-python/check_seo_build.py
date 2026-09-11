from pathlib import Path

root = Path("dist")
home = (root / "index.html").read_text(encoding="utf-8")
blog = (root / "news/tango-news-neden-var/index.html").read_text(encoding="utf-8")
event = (root / "news/tangocat-schwarzwalder-kirschtango-marathon/index.html").read_text(encoding="utf-8")
nf = (root / "404.html").read_text(encoding="utf-8")
print("home ld", "application/ld+json" in home, "WebSite" in home)
print("blog NewsArticle", "NewsArticle" in blog)
print("event Event", '"Event"' in event)
print("404 noindex", "noindex" in nf)
print("tr404", (root / "tr/404/index.html").exists())
