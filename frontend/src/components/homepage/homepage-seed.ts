/** Marketing demonstration content, independent of the live member catalog. */
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
  value: number;
  suffix: string;
  title: LocalizedText;
  lead: LocalizedText;
  items: ShowcaseItem[];
}> = [
  {
    id: "coaches",
    value: 24,
    suffix: "+",
    title: { en: "Professional coaches", vi: "Huấn luyện viên chuyên nghiệp" },
    lead: {
      en: "The right guidance for your next personal best.",
      vi: "Đồng hành cùng bạn trên hành trình vượt qua giới hạn.",
    },
    items: [
      {
        name: { en: "Trần Minh Khang", vi: "Trần Minh Khang" },
        detail: { en: "Badminton", vi: "Cầu lông" },
        highlight: {
          en: "8 years of coaching experience",
          vi: "8 năm kinh nghiệm huấn luyện",
        },
        image: "/sporthub/coaches/minh-khang.webp",
        alt: {
          en: "Illustrative portrait of badminton coach Trần Minh Khang",
          vi: "Chân dung minh họa huấn luyện viên cầu lông Trần Minh Khang",
        },
      },
      {
        name: { en: "Nguyễn Hải Linh", vi: "Nguyễn Hải Linh" },
        detail: {
          en: "Basketball",
          vi: "Bóng rổ",
        },
        highlight: {
          en: "6 years of coaching experience",
          vi: "6 năm kinh nghiệm huấn luyện",
        },
        image: "/sporthub/coaches/hai-linh.webp",
        alt: {
          en: "Illustrative portrait of basketball coach Nguyễn Hải Linh",
          vi: "Chân dung minh họa huấn luyện viên bóng rổ Nguyễn Hải Linh",
        },
      },
      {
        name: { en: "Lê Thảo An", vi: "Lê Thảo An" },
        detail: {
          en: "Gym",
          vi: "Gym",
        },
        highlight: {
          en: "10 years of coaching experience",
          vi: "10 năm kinh nghiệm huấn luyện",
        },
        image: "/sporthub/coaches/thao-an.webp",
        alt: {
          en: "Illustrative portrait of gym coach Lê Thảo An",
          vi: "Chân dung minh họa huấn luyện viên Gym Lê Thảo An",
        },
      },
    ],
  },
  {
    id: "facilities",
    value: 12,
    suffix: "",
    title: { en: "Courts & training zones", vi: "Sân và khu tập" },
    lead: {
      en: "Purpose-built spaces, from your warm-up to the final rally.",
      vi: "Không gian chuyên biệt, từ khởi động đến pha cầu cuối cùng.",
    },
    items: [
      {
        name: { en: "Indoor courts", vi: "Sân đấu trong nhà" },
        detail: {
          en: "Badminton and basketball under one roof.",
          vi: "Cầu lông và bóng rổ trong cùng nhà thi đấu.",
        },
        highlight: {
          en: "Sport flooring / low-glare lighting",
          vi: "Mặt sàn thể thao / đèn hạn chế chói",
        },
        image: "/sporthub/court-volt/course-badminton.png",
        alt: {
          en: "Indoor badminton court with teal sport flooring",
          vi: "Sân cầu lông trong nhà với mặt sàn thể thao xanh",
        },
      },
      {
        name: { en: "Strength studio", vi: "Khu tập sức mạnh" },
        detail: {
          en: "Room to lift, build strength and train with your coach.",
          vi: "Không gian rèn sức mạnh và tập cùng huấn luyện viên.",
        },
        highlight: {
          en: "Power racks / free weights / kettlebells",
          vi: "Giàn tập / tạ tự do / tạ chuông",
        },
        image: "/sporthub/court-volt/gym-goals-background.png",
        alt: {
          en: "Strength studio with racks and weights",
          vi: "Khu tập sức mạnh với giàn tập và tạ",
        },
      },
      {
        name: { en: "Performance lanes", vi: "Khu rèn tốc độ" },
        detail: {
          en: "Dedicated lanes for movement, speed and conditioning.",
          vi: "Làn tập riêng cho chuyển động, tốc độ và thể lực.",
        },
        highlight: {
          en: "Indoor track / timing gates / training turf",
          vi: "Đường chạy / cổng đo tốc độ / thảm tập",
        },
        image: "/sporthub/court-volt/conditioning-speed-track.png",
        alt: {
          en: "Athlete training on an indoor performance track",
          vi: "Vận động viên tập trên đường chạy thể lực trong nhà",
        },
      },
    ],
  },
  {
    id: "membership",
    value: 1200,
    suffix: "+",
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
