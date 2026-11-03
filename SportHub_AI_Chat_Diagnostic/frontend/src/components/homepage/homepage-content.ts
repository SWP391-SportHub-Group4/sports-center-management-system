/** Homepage labels and editorial illustrations. Operational counts and facility data come from the API. */
export type HomepageLanguage = "en" | "vi";
export type CategoryId = "coaches" | "facilities" | "membership";
export type LocalizedText = Record<HomepageLanguage, string>;
export const homepageIntroCopy = {
  title: "A stronger community",
  lead: "The people, places and community behind every session.",
};
export type CoachImageFrame = {
  fit: "contain" | "cover";
  x: number;
  y: number;
  zoom: number;
};
export type ShowcaseItem = {
  name: LocalizedText;
  detail: LocalizedText;
  highlight: LocalizedText;
  image: string;
  alt: LocalizedText;
  frame?: CoachImageFrame;
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
    // Editorial images describe coaching, without inventing staff profiles.
    items: [
      {
        name: { en: "Badminton coaching", vi: "Huấn luyện cầu lông" },
        detail: {
          en: "Build your footwork, timing and control on court.",
          vi: "Rèn bước chân, thời điểm xử lý và kiểm soát trên sân.",
        },
        highlight: { en: "Badminton", vi: "Cầu lông" },
        image: "/sporthub/court-volt/course-badminton.png",
        alt: {
          en: "Illustration of badminton training on an indoor court",
          vi: "Hình minh họa tập cầu lông trên sân trong nhà",
        },
      },
      {
        name: { en: "Basketball coaching", vi: "Huấn luyện bóng rổ" },
        detail: {
          en: "Develop your ball handling, shooting and teamwork.",
          vi: "Phát triển kỹ năng kiểm soát bóng, ném rổ và phối hợp.",
        },
        highlight: { en: "Basketball", vi: "Bóng rổ" },
        image: "/sporthub/court-volt/course-basketball.png",
        alt: {
          en: "Illustration of basketball practice inside a sports center",
          vi: "Hình minh họa tập bóng rổ trong trung tâm thể thao",
        },
      },
      {
        name: {
          en: "Ready for your next session",
          vi: "Sẵn sàng cho buổi tập",
        },
        detail: {
          en: "Explore classes and find the right coach for your sport.",
          vi: "Khám phá lớp học và tìm huấn luyện viên phù hợp với môn tập.",
        },
        highlight: { en: "Classes & guidance", vi: "Lớp học & hướng dẫn" },
        image: "/sporthub/members/group-training.webp",
        alt: {
          en: "Illustration of a group warming up beside an indoor court",
          vi: "Hình minh họa nhóm khởi động bên sân trong nhà",
        },
      },
    ],
  },
  {
    id: "facilities",
    suffix: "",
    title: { en: "Courts & training zones", vi: "Sân và khu tập" },
    lead: {
      en: "Purpose-built spaces, from your warm-up to the final rally.",
      vi: "Không gian chuyên biệt, từ khởi động đến pha cầu cuối cùng.",
    },
    // These three sport illustrations remain visible while live room data loads.
    items: [
      {
        name: { en: "Gym", vi: "Gym" },
        detail: {
          en: "A space for strength and everyday movement.",
          vi: "Không gian rèn sức mạnh và vận động hằng ngày.",
        },
        highlight: { en: "Strength & conditioning", vi: "Sức mạnh & thể lực" },
        image: "/sporthub/court-volt/program-gym.png",
        alt: {
          en: "Illustration of a gym training space",
          vi: "Hình minh họa không gian tập Gym",
        },
      },
      {
        name: { en: "Badminton", vi: "Cầu lông" },
        detail: {
          en: "Find your rhythm on an indoor badminton court.",
          vi: "Tìm nhịp thi đấu trên sân cầu lông trong nhà.",
        },
        highlight: { en: "Indoor courts", vi: "Sân trong nhà" },
        image: "/sporthub/court-volt/course-badminton.png",
        alt: {
          en: "Illustration of an indoor badminton court",
          vi: "Hình minh họa sân cầu lông trong nhà",
        },
      },
      {
        name: { en: "Basketball", vi: "Bóng rổ" },
        detail: {
          en: "Make room for your next game and practice session.",
          vi: "Không gian dành cho trận đấu và buổi tập tiếp theo.",
        },
        highlight: { en: "Court training", vi: "Tập luyện trên sân" },
        image: "/sporthub/court-volt/course-basketball.png",
        alt: {
          en: "Illustration of a basketball training court",
          vi: "Hình minh họa sân tập bóng rổ",
        },
      },
    ],
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
