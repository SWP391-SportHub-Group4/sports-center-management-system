import Image from "next/image";
import Link from "next/link";
import styles from "./home.module.css";
import { PublicHeader } from "./public-header";

const activities = [
  {
    name: "Yoga",
    short: "Find your breath",
    detail:
      "Build body awareness, mobility, and a steady breathing rhythm through accessible foundational poses.",
    image: "/sporthub/activity-yoga-hd.webp",
    imageAlt: "A group practicing yoga on exercise mats",
  },
  {
    name: "Fitness",
    short: "Build your strength",
    detail:
      "Develop strength, endurance, and confident movement with progressive full body training.",
    image: "/sporthub/activity-fitness-hd.webp",
    imageAlt: "A group doing strength exercises with light weights",
  },
  {
    name: "GroupX",
    short: "Move together",
    detail:
      "Train to music in an energetic group class led by a SportHub coach.",
    image: "/sporthub/activity-groupx-hd.webp",
    imageAlt: "A coach leading a GroupX class",
  },
  {
    name: "Mobility & Recovery",
    short: "Recover to go further",
    detail:
      "Improve mobility and help your body recover with guided stretching and low intensity movement.",
    image: "/sporthub/activity-stretch-hd.webp",
    imageAlt: "A group performing guided mobility exercises",
  },
];

export default function HomePage() {
  return (
    <div className={styles.site}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <PublicHeader />

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.heroLabel}>SPORT · COMMUNITY · PROGRESS</p>
            <h1 id="hero-title">
              Find your rhythm.<span> Train your way.</span>
            </h1>
            <p className={styles.heroIntro}>
              Four ways to get moving, one welcoming place to build lasting
              habits and enjoy every session.
            </p>
            <a className={styles.primaryAction} href="#hoat-dong">
              Explore activities <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div
            className={styles.heroMosaic}
            aria-label="Illustrated activities"
          >
            <div className={styles.heroFrame}>
              <Image
                src="/sporthub/activity-yoga-hd.webp"
                alt="Yoga Group"
                fill
                sizes="(max-width: 760px) 33vw, 38vw"
                quality={90}
                priority
              />
            </div>
            <div className={`${styles.heroFrame} ${styles.heroFrameMain}`}>
              <Image
                src="/sporthub/home-hero.webp"
                alt="The group of fellow trainers in sports space"
                fill
                sizes="(max-width: 760px) 42vw, 30vw"
                quality={90}
                priority
              />
            </div>
            <div className={styles.heroFrame}>
              <Image
                src="/sporthub/activity-fitness-hd.webp"
                alt="Group of collective people"
                fill
                sizes="(max-width: 760px) 33vw, 38vw"
                quality={90}
                priority
              />
            </div>
          </div>
          <p className={styles.imageNote}>
            Images illustrate activities available at SportHub
          </p>
        </section>

        <section
          className={styles.story}
          id="cau-chuyen"
          aria-labelledby="story-title"
        >
          <h2 id="story-title">Start with movement. Build with confidence.</h2>
          <div className={styles.storyCopy}>
            <p>
              SportHub brings people together through purposeful training,
              welcoming spaces, and a supportive community.
            </p>
            <p>
              Whether you are taking your first step or building a long term
              routine, there is a class that fits your pace.
            </p>
          </div>
          <a className={styles.outlineAction} href="#hoat-dong">
            Find your activity
          </a>
        </section>

        <section
          className={styles.activities}
          id="hoat-dong"
          aria-labelledby="activities-title"
        >
          <div className={styles.activitiesHeading}>
            <h2 id="activities-title">Find your training rhythm.</h2>
            <p>
              Choose an activity that matches your fitness, energy, and personal
              goals.
            </p>
          </div>
          <div className={styles.activityList}>
            {activities.map((item) => (
              <article className={styles.activity} key={item.name}>
                <div className={styles.activityHeading}>
                  <p>{item.short}</p>
                  <h3>{item.name}</h3>
                </div>
                <div className={styles.activityImageWrap}>
                  <Image
                    className={styles.activityImage}
                    src={item.image}
                    alt={item.imageAlt}
                    fill
                    sizes="(max-width: 760px) calc(100vw - 44px), 50vw"
                    quality={90}
                  />
                </div>
                <p className={styles.activityDetail}>{item.detail}</p>
              </article>
            ))}
          </div>
          <p className={styles.demoNote}>
            Class names and images are illustrative. Live schedules and
            availability appear in the member area.
          </p>
        </section>

        <div className={styles.manifesto} aria-hidden="true">
          <span>MOVE · CONNECT · PROGRESS ·</span>
          <span>MOVE · CONNECT · PROGRESS ·</span>
        </div>

        <section
          className={styles.event}
          id="su-kien"
          aria-labelledby="event-title"
        >
          <div className={styles.eventImage}>
            <Image
              src="/sporthub/activity-stretch-hd.webp"
              alt="A group stretching together after a training session"
              fill
              sizes="(max-width: 760px) 100vw, 50vw"
              quality={90}
            />
          </div>
          <div className={styles.eventCopy}>
            <h2 id="event-title">See you at the next event.</h2>
            <p>
              No events have been announced yet. Community workouts and center
              activities will appear here when new dates are available.
            </p>
            <a className={styles.outlineAction} href="#hoat-dong">
              Explore regular activities
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <strong>SportHub.</strong>
          <p>One step forward, every day.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#cau-chuyen">About</a>
          <a href="#hoat-dong">Activities</a>
          <a href="#su-kien">Events</a>
          <Link href="/member">Member area</Link>
        </nav>
        <small>© {new Date().getFullYear()} SportHub</small>
      </footer>
    </div>
  );
}
