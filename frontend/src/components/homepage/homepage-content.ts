/** Homepage labels and editorial illustrations. Operational counts and facility data come from the API. */
export type HomepageLanguage = "en" | "vi";
export type CategoryId = "coaches" | "facilities" | "membership";
export type LocalizedText = Record<HomepageLanguage, string>;
export type ShowcaseItem = {
  name: LocalizedText;
  detail: LocalizedText;
  highlight: LocalizedText;
  image: string;
  alt: LocalizedText;
};

export const homepageCategories: Array<{
  id: CategoryId;
  suffix: string;
  title: LocalizedText;
  lead: LocalizedText;
  items: ShowcaseItem[];
}> = [
  {
    id: "coaches",
    suffix: "",
    title: { en: "Coaches", vi: "Huấn luyện viên chuyên nghiệp" },
    lead: {
      en: "The right guidance for your next personal best.",
      vi: "Đồng hành cùng bạn trên hành trình vượt qua giới hạn.",
    },
    items: [],
  },
  {
    id: "facilities",
    suffix: "",
    title: { en: "Courts & training zones", vi: "Sân và khu tập" },
    lead: {
      en: "Purpose-built spaces, from your warm-up to the final rally.",
      vi: "Không gian chuyên biệt, từ khởi động đến pha cầu cuối cùng.",
    },
    items: [],
  },
  {
    id: "membership",
    suffix: "",
    title: { en: "Members", vi: "Hội viên" },
    lead: {
      en: "Train together. Find fresh motivation every day.",
      vi: "Cùng tập luyện, cùng tiếp thêm động lực mỗi ngày.",
    },
    items: [
      {
        name: { en: "Stronger together", vi: "Cùng nhau khỏe hơn" },
        detail: {
          en: "Members building strength and keeping each other motivated in the gym.",
          vi: "Hội viên rèn sức mạnh và tiếp thêm động lực cho nhau trong phòng Gym.",
        },
        highlight: { en: "Gym & conditioning", vi: "Gym & thể lực" },
        image: "/sporthub/members/gym-community.webp",
        alt: {
          en: "Illustration of members training together with dumbbells at SportHub",
          vi: "Hình minh họa hội viên tập tạ cùng nhau tại SportHub",
        },
      },
      {
        name: { en: "Meet you on court", vi: "Hẹn nhau trên sân" },
        detail: {
          en: "Friendly rallies and a shared love of the game on our indoor courts.",
          vi: "Những đường cầu giao lưu và niềm vui chơi thể thao trên sân trong nhà.",
        },
        highlight: { en: "Badminton community", vi: "Cộng đồng cầu lông" },
        image: "/sporthub/members/court-community.webp",
        alt: {
          en: "Illustration of members playing doubles badminton inside the center",
          vi: "Hình minh họa hội viên chơi cầu lông đôi trong trung tâm",
        },
      },
      {
        name: { en: "A routine worth sharing", vi: "Nhịp tập cùng cộng đồng" },
        detail: {
          en: "Warm up, move and make your next session a shared experience.",
          vi: "Khởi động, vận động và cùng nhau tạo nên một buổi tập đáng nhớ.",
        },
        highlight: { en: "Movement & connection", vi: "Vận động & kết nối" },
        image: "/sporthub/members/group-training.webp",
        alt: {
          en: "Illustration of members warming up together beside an indoor court",
          vi: "Hình minh họa hội viên khởi động cùng nhau bên sân tập trong nhà",
        },
      },
    ],
  },
];
