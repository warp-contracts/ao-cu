export function tagValue(tags, name) {
  const tag =  tags.find((tag) => tag.name === name);
  return tag ? tag.value : null;
}