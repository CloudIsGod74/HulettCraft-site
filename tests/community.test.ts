import test from "node:test";
import assert from "node:assert/strict";
import {
  activeMembers,
  memberLinks,
  type CommunityMember,
} from "../src/config/community";
import { bannerImages } from "../src/config/banners";
import { existsSync } from "node:fs";

test("member directory includes all confirmed active members, with social links optional", () => {
  const members: CommunityMember[] = [
    { username: "Builder", displayName: "Builder", active: true },
    {
      username: "Explorer",
      displayName: "Explorer",
      active: true,
      links: [{ label: "Website", url: "https://example.com" }],
    },
    { username: "FormerPlayer", displayName: "Former player", active: false },
  ];
  assert.deepEqual(
    activeMembers(members).map((member) => member.username),
    ["Builder", "Explorer"],
  );
  assert.deepEqual(memberLinks(members[0]), []);
});

test("member links accept public HTTPS URLs and reject active protocols or credentials", () => {
  const member: CommunityMember = {
    username: "Builder",
    displayName: "Builder",
    active: true,
    links: [
      { label: "YouTube", url: "https://www.youtube.com/@example" },
      { label: "Unsafe", url: "javascript:alert(1)" },
      { label: "Unsafe", url: "data:text/html,<script>alert(1)</script>" },
      { label: "Credentials", url: "https://user:password@example.com" },
      { label: "HTTP", url: "http://example.com" },
      { label: "Missing", url: "/member" },
      { label: "", url: "https://example.com" },
    ],
  };
  assert.deepEqual(memberLinks(member), [member.links![0]]);
});

test("banner playlists use existing local screenshots, with separate Hytale images and route variety", () => {
  for (const route of [
    "/",
    "/community",
    "/status",
    "/hytale",
    "/gallery/hytale",
  ]) {
    const images = bannerImages(route);
    assert.ok(images.length >= 2);
    for (const image of images)
      assert.ok(existsSync("public" + decodeURI(image.src)), image.src);
  }
  assert.ok(
    bannerImages("/hytale").every((image) => image.src.includes("/hytale/")),
  );
  assert.ok(
    bannerImages("/gallery/hytale").every((image) =>
      image.src.includes("/hytale/"),
    ),
  );
  assert.notEqual(bannerImages("/")[0].src, bannerImages("/community")[0].src);
});
