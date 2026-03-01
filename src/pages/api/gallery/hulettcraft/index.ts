const seasons = Object.entries(HULETTCRAFT_SEASONS);

const results = await Promise.all(
  seasons.map(async ([num, season]) => {
    const prefix = `Screenshots/hulettcraft/season-${num}/`;
    const list = await bucket.list({ prefix });

    const first = list.objects.find(
      (o) => !o.key.endsWith("/")
    );

    return {
      season: num,
      title: season.title,
      description: season.description,
      preview: first
        ? `/api/gallery/image?key=${encodeURIComponent(first.key)}`
        : null,
    };
  })
);